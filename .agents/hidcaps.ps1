param([string]$InstanceId = 'HID\VID_16D0&PID_127A&MI_02\C&973CF29&0&0000')

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Hid
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr h);

    [DllImport("hid.dll")]
    public static extern bool HidD_GetPreparsedData(IntPtr h, out IntPtr preparsed);

    [DllImport("hid.dll")]
    public static extern bool HidD_FreePreparsedData(IntPtr preparsed);

    [DllImport("hid.dll", CharSet = CharSet.Unicode)]
    public static extern bool HidD_GetProductString(IntPtr h, IntPtr buffer, uint len);

    [DllImport("hid.dll")]
    public static extern int HidP_GetCaps(IntPtr preparsed, IntPtr caps);

    [DllImport("hid.dll")]
    public static extern int HidP_GetButtonCaps(int reportType, IntPtr caps, ref ushort len, IntPtr preparsed);

    [DllImport("hid.dll")]
    public static extern int HidP_GetValueCaps(int reportType, IntPtr caps, ref ushort len, IntPtr preparsed);
}
'@

$path = '\\?\' + ($InstanceId -replace '\\', '#') + '#{4d1e55b2-f16f-11cf-88cb-001111000030}'
Write-Host "Path: $path"

$h = [Hid]::CreateFileW($path, 0, 3, [IntPtr]::Zero, 3, 0x40000000, [IntPtr]::Zero)
if ($h -eq [IntPtr](-1)) { throw "CreateFile failed: $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" }

$pp = [IntPtr]::Zero
if (-not [Hid]::HidD_GetPreparsedData($h, [ref]$pp)) { throw 'HidD_GetPreparsedData failed' }

$buf = [Runtime.InteropServices.Marshal]::AllocHGlobal(256)
if ([Hid]::HidD_GetProductString($h, $buf, 256)) {
    Write-Host ("Product: " + [Runtime.InteropServices.Marshal]::PtrToStringUni($buf))
}
[Runtime.InteropServices.Marshal]::FreeHGlobal($buf)

$caps = [Runtime.InteropServices.Marshal]::AllocHGlobal(64)
[void][Hid]::HidP_GetCaps($pp, $caps)
function U16($p, $o) { [uint16][Runtime.InteropServices.Marshal]::ReadInt16($p, $o) }
Write-Host ("Usage/Page:        0x{0:x2}/0x{1:x2}" -f (U16 $caps 0), (U16 $caps 2))
Write-Host ("InputReportBytes:  " + (U16 $caps 4))
Write-Host ("LinkCollections:   " + (U16 $caps 44))
$nBtn = U16 $caps 46
$nVal = U16 $caps 48
Write-Host ("InputButtonCaps:   $nBtn")
Write-Host ("InputValueCaps:    $nVal")
Write-Host ''

if ($nBtn -gt 0) {
    $bc = [Runtime.InteropServices.Marshal]::AllocHGlobal(72 * $nBtn)
    $len = [uint16]$nBtn
    [void][Hid]::HidP_GetButtonCaps(0, $bc, [ref]$len, $pp)
    Write-Host "--- BUTTON CAPS ---"
    for ($i = 0; $i -lt $len; $i++) {
        $c = [IntPtr]::Add($bc, $i * 72)
        $page = U16 $c 0
        $link = U16 $c 6
        $isRange = [Runtime.InteropServices.Marshal]::ReadByte($c, 12)
        if ($isRange -ne 0) {
            $min = U16 $c 56; $max = U16 $c 58
            Write-Host ("  page=0x{0:x2} link={1} usages {2}..{3}  (count {4})" -f $page, $link, $min, $max, ($max - $min + 1))
        } else {
            Write-Host ("  page=0x{0:x2} link={1} usage {2}" -f $page, $link, (U16 $c 56))
        }
    }
    [Runtime.InteropServices.Marshal]::FreeHGlobal($bc)
}
Write-Host ''

if ($nVal -gt 0) {
    $vc = [Runtime.InteropServices.Marshal]::AllocHGlobal(72 * $nVal)
    $len = [uint16]$nVal
    [void][Hid]::HidP_GetValueCaps(0, $vc, [ref]$len, $pp)
    Write-Host "--- VALUE CAPS ---"
    for ($i = 0; $i -lt $len; $i++) {
        $c = [IntPtr]::Add($vc, $i * 72)
        $page = U16 $c 0
        $link = U16 $c 6
        $isAbs = [Runtime.InteropServices.Marshal]::ReadByte($c, 15)
        $bits = U16 $c 18
        $count = U16 $c 20
        $lmin = [Runtime.InteropServices.Marshal]::ReadInt32($c, 40)
        $lmax = [Runtime.InteropServices.Marshal]::ReadInt32($c, 44)
        $isRange = [Runtime.InteropServices.Marshal]::ReadByte($c, 12)
        $usageTxt = if ($isRange -ne 0) { "{0}..{1}" -f (U16 $c 56), (U16 $c 58) } else { "{0}" -f (U16 $c 56) }
        Write-Host ("  page=0x{0:x2} link={1} usage={2} bits={3} count={4} abs={5} logical={6}..{7}" -f $page, $link, $usageTxt, $bits, $count, $isAbs, $lmin, $lmax)
    }
    [Runtime.InteropServices.Marshal]::FreeHGlobal($vc)
}

[Runtime.InteropServices.Marshal]::FreeHGlobal($caps)
[void][Hid]::HidD_FreePreparsedData($pp)
[void][Hid]::CloseHandle($h)
