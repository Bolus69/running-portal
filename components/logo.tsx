import Image from 'next/image'

export function LogoMark({ small = false }: { small?: boolean }) {
  return (
    <Image
      src="/marathon-coach-mark.png"
      width={1254}
      height={1254}
      className={small ? 'logo-mark logo-mark-small' : 'logo-mark'}
      alt=""
      aria-hidden="true"
    />
  )
}
