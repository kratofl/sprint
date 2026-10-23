import Image from 'next/image'
import sprintMark from '@/app/icon.svg'

/**
 * The Sprint mark and name, as the sidebar's top row shows them. The mark is the
 * same artwork as the favicon (app/icon.svg) and the desktop app.
 */
export default function Brand() {
  return (
    <>
      <Image className="size-6 shrink-0" src={sprintMark} alt="" width={24} height={24} priority />
      <span className="min-w-0 truncate text-[14px] font-semibold">Sprint</span>
    </>
  )
}
