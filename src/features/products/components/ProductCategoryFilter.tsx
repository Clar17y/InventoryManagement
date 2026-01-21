import type { Category } from '../../../lib/api'

interface ProductCategoryFilterProps {
  showForm: boolean
  categoryList: Category[]
  filterCategory: string
  onChange: (value: string) => void
}

export default function ProductCategoryFilter({
  showForm,
  categoryList,
  filterCategory,
  onChange,
}: ProductCategoryFilterProps) {
  if (showForm || categoryList.length === 0) return null

  return (
    <select
      value={filterCategory}
      onChange={(e) => onChange(e.target.value)}
      className="input w-full"
    >
      <option value="">All Categories</option>
      {categoryList.map((cat) => (
        <option key={cat.id} value={cat.id}>{cat.name}</option>
      ))}
    </select>
  )
}

