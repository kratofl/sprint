param(
    [string]$InstanceId = 'HID\VID_16D0&PID_127A&MI_02\C&973CF29&0&0000',
    [string]$LogPath = 'C:\Projects\sprint\.agents\hidmon.log',
    [int]$Seconds = 180
)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class HidMon
{
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern IntPtr CreateFileW(string name, uint access, uint share, IntPtr sec, uint creation, uint flags, IntPtr template);

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool ReadFile(IntPtr h, byte[] buffer, uint toRead, out uint read, IntPtr overlapped);

    [DllImport("kernel32.dll")]
    public static extern bool CloseHandle(IntPtr h);

    [DllImport("hid.dll")]
    public static extern bool HidD_GetPreparsedData(IntPtr h, out IntPtr preparsed);

    [DllImport("hid.dll")]
    public static extern uint HidP_MaxUsageListLength(int reportType, ushort usagePage, IntPtr preparsed);

    [DllImport("hid.dll")]
    public static extern int HidP_GetUsages(int reportType, ushort usagePage, ushort linkCollection, [Out] ushort[] usages, ref uint usageLength, IntPtr preparsed, byte[] report, uint reportLength);

    [DllImport("hid.dll")]
    public static extern int HidP_GetUsageValue(int reportType, ushort usagePage, ushort linkCollection, ushort usage, out uint value, IntPtr preparsed, byte[] report, uint reportLength);
}
'@

$path = '\\?\' + ($InstanceId -replace '\\', '#') + '#{4d1e55b2-f16f-11cf-88cb-001111000030}'
$GenericRead = [uint32]2147483648
$h = [HidMon]::CreateFileW($path, $GenericRead, [uint32]3, [IntPtr]::Zero, [uint32]3, [uint32]0, [IntPtr]::Zero)
if ($h -eq [IntPtr]::Zero -or $h -eq [IntPtr](-1)) {
    "CreateFile failed: Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" | Set-Content -Path $LogPath
    exit 1
}

$pp = [IntPtr]::Zero
if (-not [HidMon]::HidD_GetPreparsedData($h, [ref]$pp)) {
    "HidD_GetPreparsedData failed: Win32 $([Runtime.InteropServices.Marshal]::GetLastWin32Error())" | Set-Content -Path $LogPath
    [void][HidMon]::CloseHandle($h)
    exit 1
}

$maxUsages = [HidMon]::HidP_MaxUsageListLength(0, 0x09, $pp)
"# monitor start  maxUsages=$maxUsages" | Set-Content -Path $LogPath
$report = New-Object byte[] 24
$prevButtons = ''
$prevHats = ''
$prevAxes = ''
$deadline = (Get-Date).AddSeconds($Seconds)

while ((Get-Date) -lt $deadline) {
    $read = 0
    if (-not [HidMon]::ReadFile($h, $report, 24, [ref]$read, [IntPtr]::Zero)) { break }
    if ($read -eq 0) { continue }

    $usages = New-Object uint16[] $maxUsages
    $count = [uint32]$maxUsages
    $status = [HidMon]::HidP_GetUsages(0, 0x09, 0, $usages, [ref]$count, $pp, $report, [uint32]$read)
    $buttons = ''
    if ($status -eq 0x00110000 -and $count -gt 0) {
        $buttons = (($usages[0..($count - 1)] | Where-Object { $_ -gt 0 } | Sort-Object) -join ',')
    }

    $hatParts = @()
    foreach ($lc in 0, 1) {
        $v = [uint32]0
        if ([HidMon]::HidP_GetUsageValue(0, 0x01, [uint16]$lc, 0x39, [ref]$v, $pp, $report, [uint32]$read) -eq 0x00110000) {
            $hatParts += "lc$lc=$v"
        }
    }
    $hats = $hatParts -join ' '

    $axisParts = @()
    foreach ($u in 0x30, 0x31, 0x32) {
        $v = [uint32]0
        if ([HidMon]::HidP_GetUsageValue(0, 0x01, [uint16]1, [uint16]$u, [ref]$v, $pp, $report, [uint32]$read) -eq 0x00110000) {
            $axisParts += ("{0:x2}={1}" -f $u, [math]::Round($v / 2048))
        }
    }
    $axes = $axisParts -join ' '

    if ($buttons -ne $prevButtons -or $hats -ne $prevHats -or $axes -ne $prevAxes) {
        $hex = ($report[0..($read - 1)] | ForEach-Object { $_.ToString('x2') }) -join ' '
        $stamp = (Get-Date).ToString('HH:mm:ss.fff')
        "$stamp  buttons=[$buttons]  hat($hats)  axes($axes)  raw=$hex" | Add-Content -Path $LogPath
        $prevButtons = $buttons
        $prevHats = $hats
        $prevAxes = $axes
    }
}

"# monitor stop" | Add-Content -Path $LogPath
[void][HidMon]::CloseHandle($h)
