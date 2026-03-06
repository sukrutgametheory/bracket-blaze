import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const naturalNameCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

export function sortByNaturalName<T extends { name: string }>(items: T[]) {
  return [...items].sort((a, b) => naturalNameCollator.compare(a.name, b.name))
}
