export function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <svg className={small ? 'logo-mark logo-mark-small' : 'logo-mark'} viewBox="0 0 48 48" fill="none" role="img" aria-label="Marathon Coach logo">
      <rect width="48" height="48" rx="15" fill="#17241D" />
      <circle cx="29" cy="10.5" r="3.5" fill="#C9F36B" />
      <path d="m25.5 17 6 4-2.8 6.5 7 5M25.5 17l-7 6.2-5 1M29 27.5l-7.8 8-2 4.5M28 21l-8.8 7.2-4 8.5" stroke="#C9F36B" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 41h32" stroke="#F7F7F2" strokeWidth="1.6" strokeLinecap="round" opacity=".65" />
    </svg>
  )
}
