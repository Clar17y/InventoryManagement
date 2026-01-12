export class SyncHttpError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    const message =
      typeof body.error === 'string'
        ? body.error
        : body.error
          ? String(body.error)
          : 'Sync request failed';
    super(message);
    this.status = status;
    this.body = body;
  }
}
