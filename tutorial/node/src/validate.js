// Request validation for POST /orders, in the order the contract lists.

export const MSG = {
  json: 'invalid JSON body',
  customer: 'customer is required',
  items: 'items must have 1 to 10 entries',
  projectId: 'project_id is required',
  quantity: 'quantity must be between 1 and 99',
}

const isNonEmptyString = (v) => typeof v === 'string' && v !== ''

// Returns an error message, or null when the body is valid.
export function validateOrder(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return MSG.json
  if (!isNonEmptyString(body.customer)) return MSG.customer
  const { items } = body
  if (!Array.isArray(items) || items.length < 1 || items.length > 10) return MSG.items
  for (const item of items) {
    if (item === null || typeof item !== 'object' || !isNonEmptyString(item.project_id)) {
      return MSG.projectId
    }
    const q = item.quantity
    if (!Number.isInteger(q) || q < 1 || q > 99) return MSG.quantity
  }
  return null
}
