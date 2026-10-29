/** The knight that marks the current quest and stands for a rank. Drawn inline so it takes the current colour. */
export function KnightMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
      <path d="M9 27h15v-2.2c0-1-.6-1.8-1.6-1.8H10.6c-1 0-1.6.8-1.6 1.8V27z" />
      <path d="M12.2 22.5c-.4-4.1 1.5-6.4 3.6-8.2.9-.8 1.7-1.5 2.2-2.5l-1.8.6c-.6.2-1.1-.1-1.4-.6l-.4-.9c-.9.6-2.1.9-3.1.2-.6-.4-.8-1.2-.4-1.8l1.6-2.5C13.3 5.4 14.7 4.6 16.3 4.6c2.2 0 4.1 1.3 5.4 3.3 1.5 2.3 2.2 5.5 2.4 9.1l.3 5.5H12.2z" />
      <circle cx="17.6" cy="9.4" r="1" fill="var(--ground)" />
    </svg>
  )
}
