# Site Pagination and Filter Performance Design

**Date:** 2026-08-20  
**Status:** Approved for implementation planning  
**Primary usage:** Laptop-first, single-user inventory management

## Purpose

Large lists and date-filtered views must remain responsive as the business history and catalogue grow. Every operation that can take noticeable time must give immediate feedback, and high-volume screens must stop downloading or processing their complete datasets merely to display one screenful.

This design establishes one shared numbered-pagination system, migrates the high-volume screens to server-side filtering and pagination, and removes the main known sources of unnecessary work in the Sales, Expenses, Products, Inventory, and Hampers flows.

## Current Problems

The Sales list already uses a limited form of pagination, but a filter change still starts several expensive or unrelated operations:

- It fetches the requested sales page.
- It recalculates a summary by loading every matching sale and its lines into application memory.
- It reloads all hampers even though date and search filters do not affect hamper data.
- Duplicate initial requests can be issued.
- Older requests are not cancelled or ignored, so a slow earlier response can replace newer results.
- The page gives little visible feedback while filtered data is updating.

Other high-volume screens have broader scaling problems:

- Products downloads the complete active catalogue and filters text locally.
- Inventory downloads the complete product/lot view and filters and sorts locally.
- Hampers downloads every active hamper and calculates availability through repeated per-hamper and per-variant database work.
- Categories and product-selection dialogs independently download the complete product catalogue.
- Expenses paginates its visible rows, but its growing monthly summary work is not fully database-aggregated.

Small reference lists and aggregate-only analytics endpoints do not have the same pagination requirement.

## Product Decisions

### Pagination interaction

- Use numbered pages rather than infinite scrolling or a “Load more” control.
- Show Previous and Next controls, direct page selection, total result count, and a range label such as “Showing 26–50 of 342.”
- Use 25 rows per page by default.
- Allow 25, 50, or 100 rows per page, with 100 as the server-enforced maximum.
- Store the current page and page size in URL query parameters so refresh, browser history, and shared links preserve the view.
- Reset to page 1 when a filter, search term, sort order, or page size changes.
- Prefer a compact laptop-oriented layout. Preserve basic responsive safety without designing the interaction around phone use.

### Loading interaction

- Keep the current results visible during page, filter, search, and sort updates.
- Slightly dim the results and show a clear spinner with the text “Updating results…”.
- Disable pagination controls while the active request is running.
- Announce loading and updated result counts through an accessible live status region.
- Initial empty-screen loading may use the existing full loading presentation, but subsequent refreshes must not blank the list.

### Failure interaction

- If an update fails, keep the last successful results visible.
- Show a nearby inline error with a Retry action.
- A stale or cancelled request must not display an error and must never replace newer data.
- Invalid or out-of-range URL pagination values fall back to a valid page.
- When deletion makes the current page empty, navigate to the nearest previous valid page and reload it.

## Shared Frontend Architecture

Create a shared pagination model and presentation component rather than duplicating page calculations and controls in each feature.

The shared model owns:

- page and page-size parsing and URL serialization;
- allowed page sizes;
- first/previous/next/last-page calculations;
- visible page-number calculation with compact ellipses for large page counts;
- resetting the page after a query-changing input;
- clamping invalid values after a response changes the known total.

The shared presentation component receives the current page, page size, total count, loading state, and callbacks. It does not fetch data or know feature-specific filters.

Each feature owns a focused server-list state hook or equivalent page-level state that:

- builds the feature’s request from pagination, filters, search, and sort state;
- retains the last successful response during updates;
- aborts an obsolete request where supported and uses a request-version guard as a final stale-response protection;
- distinguishes initial loading, background updating, load failure, and successful empty results;
- exposes retry without changing the current query;
- prevents duplicate initial fetches.

Filter controls remain feature-specific. Text search keeps the existing short debounce so normal typing does not create a request for every keystroke. Date and discrete selector changes apply immediately. Multi-field presets such as a date-range shortcut update the effective query once rather than issuing one request per field setter.

## Shared API Contract

All migrated list endpoints use a validated contract with:

- `page`: positive integer, default 1;
- `pageSize`: one of 25, 50, or 100, default 25;
- feature-specific filters;
- a supported sort field and sort direction.

Responses use a consistent envelope:

```ts
{
  items: T[];
  pagination: {
    page: number;
    pageSize: 25 | 50 | 100;
    totalItems: number;
    totalPages: number;
  };
}
```

Every paginated query must have deterministic ordering. The selected business sort is followed by the record ID as a tie-breaker so an item cannot move unpredictably between pages when sort values match.

The server validates all pagination, filter, and sort inputs. Unsupported values receive the project’s normal validation response rather than being interpolated into database queries. Existing client methods may use temporary adapters during migration, but each screen is moved atomically to the shared envelope so the application does not retain two permanent pagination models.

## Data Flow

For a typical filter or page change:

1. The control updates URL-backed query state.
2. Query-changing filters reset the page to 1 in the same state transition.
3. The feature marks the existing result as updating and starts one list request.
4. Any obsolete request is aborted or marked stale.
5. The server validates the query, runs a bounded data query and matching count query, and returns the shared envelope.
6. Only the latest request may commit the result.
7. The page removes the updating state and announces the visible range and total.

Summary data is requested only when its inputs change. It is not implicitly coupled to unrelated reference data. Reference data needed for creation or editing is loaded once, cached at the appropriate feature level, or fetched when the relevant dialog opens.

## Performance Changes by Area

### Sales

- Replace the current “Load more” presentation with the shared numbered pagination.
- Validate and cap pagination input on the Sales list endpoint.
- Remove the duplicate initial load path.
- Do not reload hampers when Sales date, search, sort, or page state changes. Load hamper reference data separately and only when required by the sale workflow.
- Protect list and summary results independently from stale responses.
- Replace the summary’s unbounded sale-and-line load with database-side aggregate/group queries that return compact totals.
- Preserve current summary definitions and fee/margin semantics.
- Correct and test date-boundary construction against the intended Europe/London business-day interpretation. The API must translate date-only inputs to explicit, consistent instants rather than mixing UTC parsing with local end-of-day mutation.

### Expenses

- Replace “Load more” with the shared numbered pagination.
- Preserve the existing validated list/count behavior while adapting the response to the shared envelope.
- Move monthly summary grouping to database aggregation so response work grows with result groups rather than matching rows.

### Products

- Add server-side pagination, text search, category filtering, and supported sorting.
- Return only the stock/cost relations needed to render the current page.
- Add or adjust database indexes only after query-plan evidence shows they are useful.
- Treat this endpoint as the reusable product-search source for other screens and dialogs.

### Inventory

- Use a paginated inventory view designed for the rendered row rather than downloading the entire product catalogue.
- Move search, low-stock filtering, category filtering, and sorting to the server.
- Keep alert endpoints separate, but measure and optimize their load-all calculations where data volume makes them material.
- Reuse the shared pagination controls and background-update behavior.

### Hampers

- Add server-side pagination, search, visibility filtering, and supported sorting.
- Replace per-hamper and per-variant availability query fanout with batched queries and in-memory mapping over only the current page.
- Preserve the current visibility, expansion, editing, and variant behavior.

### Categories and Product Selection

- Keep the category reference list unpaginated because it is expected to remain small.
- Stop loading all products merely to display category contents or a product-selection dialog.
- Reuse the paginated product-search contract, including server search and category filtering.

### Analytics, Shopping List, Suppliers, and Etsy

- Do not paginate compact aggregate chart results; keep aggregation in the database and return bounded datasets.
- Keep small supplier and category reference lists unpaginated unless measurements demonstrate a need.
- Treat naturally bounded low-stock shopping results separately from general catalogue pagination.
- Do not force Etsy provider-backed lists into the offset/page contract as part of this work. Provider pagination and correctness gaps, including pending orders beyond the first provider page, require a separate cursor-aware design.

## Measurement and Indexing

Before and after each feature migration, record representative development or test measurements for:

- HTTP request count for initial load, filter change, and page change;
- response payload size;
- server route duration;
- database query count;
- query execution plan for expensive database work;
- rendered row count.

Indexes are added only when representative query plans demonstrate a scan or sort that the proposed index improves. Candidate areas include product category filtering, hamper active/search ordering, expiring inventory lots, and combined Sales predicates, but the design does not assume those indexes are beneficial without evidence.

No production database profiling or migration is authorized by this design.

## Rollout Order

1. Shared contracts, pagination state, controls, loading presentation, and test utilities.
2. Sales and Expenses migration, including Sales request cleanup, summary aggregation, and date-boundary correction.
3. Products and Inventory server-side pagination/filtering.
4. Categories and product-selection consumers of paged product search.
5. Hampers pagination and batched availability calculations.
6. Audit remaining list screens against the shared criteria and document intentionally unpaginated surfaces.

Each stage must be independently testable and leave the application usable. API compatibility shims are temporary and removed when the affected stage is complete.

## Testing Strategy

### Shared frontend tests

- page-number and ellipsis calculation;
- Previous/Next boundaries;
- 25/50/100 selection;
- URL parsing, serialization, history behavior, and invalid values;
- filter and page-size reset to page 1;
- visible results retained during background updates;
- loading indicator and accessible status announcements;
- stale and aborted responses ignored;
- retry after failure;
- deletion from the last populated page.

### Feature tests

- each migrated screen sends the expected page, page size, filters, and sort;
- Sales filter changes do not reload hamper reference data;
- presets issue one effective Sales query transition;
- Sales and Expenses no longer expose “Load more” behavior;
- Products, Inventory, and Hampers do not fetch or render the complete dataset;
- editing, selection, and expansion behavior remains intact on the visible page.

### Server tests

- validation, defaults, and maximum page size;
- shared response envelope and accurate totals;
- deterministic tie-breaker sorting;
- feature filter/search/sort composition;
- aggregate summaries match existing financial results;
- Europe/London Sales date boundaries, including daylight-saving transitions;
- query-count regressions for Hampers availability batching;
- no unbounded record load in migrated summary and list routes.

## Completion Criteria

The work is complete when:

- all identified high-volume screens use the shared numbered-pagination system;
- no migrated list downloads the complete matching dataset to show one page;
- pagination defaults to 25 and permits 25, 50, or 100 rows;
- current results remain visible with immediate “Updating results…” feedback during every refresh;
- stale responses cannot replace newer results;
- Sales filtering does not reload unrelated hamper data or issue duplicate initial loads;
- Sales and Expenses summaries use bounded database aggregation;
- Hampers availability work is batched for the current page;
- all migrated endpoints have validated input and deterministic sorting;
- automated tests and representative before/after measurements demonstrate the intended behavior;
- intentionally unpaginated screens are documented with a reason.

## Out of Scope

- A phone-first pagination redesign.
- Infinite scrolling.
- Changes to financial definitions or business reporting semantics.
- Production database profiling or deployment.
- General redesign of list rows, forms, or editing workflows.
- Cursor pagination for Etsy provider data; this should be designed separately.
