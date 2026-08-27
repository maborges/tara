function parseDecimalBR(value: string | number | null | undefined): number {
  if (typeof value === "number") return value
  if (value == null || value === "") return Number.NaN
  const normalized = String(value).replace(/\./g, "").replace(",", ".")
  return Number(normalized)
}

type ClassValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>

function toClassValue(input: ClassValue): string {
  if (!input) return ""
  if (typeof input === "string" || typeof input === "number") {
    return String(input)
  }
  if (Array.isArray(input)) {
    return input.map(toClassValue).filter(Boolean).join(" ")
  }

  return Object.entries(input)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key)
    .join(" ")
}

export function cn(...inputs: ClassValue[]) {
  return inputs.map(toClassValue).filter(Boolean).join(" ")
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value)
}

export function parseLocaleNumber(value: string | number | null | undefined, fallback = 0) {
  const parsed = parseDecimalBR(value)
  return Number.isFinite(parsed) ? parsed : fallback
}
