import Image from 'next/image'
import sprintMark from '@/app/icon.svg'

/**
 * The Sprint mark and name, as the sidebar header and the sign-in page show them.
 * The mark is the same artwork as the favicon (app/icon.svg) and the desktop app.
 */
export default function Brand() {
  return (
    <>
      <Image className="app-mark" src={sprintMark} alt="" width={22} height={22} priority />
      <span className="app-name">Sprint</span>
    </>
  )
}
