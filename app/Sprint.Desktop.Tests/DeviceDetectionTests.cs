using Sprint.Desktop.Features.Devices;
using Xunit;

namespace Sprint.Desktop.Tests;

/// <summary>
/// "Plugged in now" in the Add device dialog: which catalog entries the USB scan found that are
/// not added yet (<see cref="DeviceDetection"/>), and how scan paths become ids
/// (<see cref="UsbPresence.Parse"/>).
/// </summary>
public sealed class DeviceDetectionTests
{
    private static readonly UsbId VoCorePanel = new(0xC872, 0x1004);
    private static readonly UsbId OmegaButtons = new(0x16D0, 0x127A);
    private static readonly UsbId Usbd480Panel = new(0x16C0, 0x08A7);
    private static readonly UsbId Mouse = new(0x046D, 0xC077);

    // The shipped presets' detect lists (app/Sprint.Desktop.Host/presets/devices), Omega listed last
    // on purpose: it must still claim its panel before the bare VoCore entry does.
    private static readonly CatalogDevice[] Catalog =
    [
        new() { Id = "generic-vocore", Driver = "vocore", Detect = [new UsbIdPattern { Vid = 0xC872 }] },
        new() { Id = "generic-usbd480", Driver = "usbd480", Detect = [new UsbIdPattern { Vid = 0x16C0, Pid = 0x08A7 }] },
        new()
        {
            Id = "bavarian-omega-v2-pro",
            Driver = "vocore",
            Vid = 0xC872,
            Pid = 0x1004,
            Detect = [new UsbIdPattern { Vid = 0xC872, Pid = 0x1004 }, new UsbIdPattern { Vid = 0x16D0, Pid = 0x127A }],
        },
    ];

    [Fact]
    public void An_omega_takes_its_panel_with_its_button_box_rather_than_showing_as_a_bare_vocore()
    {
        IReadOnlyList<string> found = DeviceDetection.FindNew(Catalog, [], [Mouse, VoCorePanel, OmegaButtons]);

        Assert.Equal(["bavarian-omega-v2-pro"], found);
    }

    [Fact]
    public void A_vocore_panel_without_the_button_box_is_a_vocore_screen()
    {
        IReadOnlyList<string> found = DeviceDetection.FindNew(Catalog, [], [VoCorePanel, Usbd480Panel]);

        Assert.Equal(["generic-vocore", "generic-usbd480"], found);
    }

    [Fact]
    public void A_saved_device_keeps_its_hardware_so_only_the_new_one_is_offered()
    {
        SavedDevice omega = new() { Id = "omega", PresetId = "bavarian-omega-v2-pro", Driver = "vocore", Vid = 0xC872, Pid = 0x1004 };
        UsbId secondPanel = new(0xC872, 0x1004);

        Assert.Empty(DeviceDetection.FindNew(Catalog, [omega], [VoCorePanel, OmegaButtons]));
        Assert.Equal(["generic-vocore"], DeviceDetection.FindNew(Catalog, [omega], [VoCorePanel, OmegaButtons, secondPanel]));
    }

    [Fact]
    public void A_custom_wheel_with_a_vocore_screen_owns_a_vocore_panel()
    {
        SavedDevice custom = new() { Id = "rim", PresetId = "custom-wheel-my-rim", Type = "wheel", Driver = "vocore" };

        Assert.Empty(DeviceDetection.FindNew(Catalog, [custom], [VoCorePanel]));
    }

    [Fact]
    public void A_buttons_only_wheel_claims_nothing()
    {
        SavedDevice buttonsOnly = new() { Id = "rim", PresetId = "custom-wheel-rim", Type = "wheel", Driver = "" };

        Assert.Equal(["generic-usbd480"], DeviceDetection.FindNew(Catalog, [buttonsOnly], [Usbd480Panel]));
    }

    [Fact]
    public void Each_device_is_offered_once_per_unit_plugged_in()
    {
        IReadOnlyList<string> found = DeviceDetection.FindNew(Catalog, [], [Usbd480Panel, Usbd480Panel]);

        Assert.Equal(["generic-usbd480", "generic-usbd480"], found);
    }

    [Fact]
    public void Scan_paths_give_one_id_per_device_and_functions_count_only_without_their_device()
    {
        IReadOnlyList<UsbId> ids = UsbPresence.Parse(
        [
            @"\\?\usb#vid_c872&pid_1004#7&2b3c&0&3#{a5dcbf10-6530-11d2-901f-00c04fb951ed}",
            @"\\?\usb#vid_16d0&pid_127a#5&1a2b&0&1#{a5dcbf10-6530-11d2-901f-00c04fb951ed}",
            @"\\?\usb#vid_16d0&pid_127a&mi_00#6&aa&0&0000#{a5dcbf10-6530-11d2-901f-00c04fb951ed}",
            @"\\?\usb#vid_16c0&pid_08a7&mi_01#6&bb&0&0001#{a5dcbf10-6530-11d2-901f-00c04fb951ed}",
            @"\\?\root#system#0000#{a5dcbf10-6530-11d2-901f-00c04fb951ed}",
        ]);

        Assert.Equal([VoCorePanel, OmegaButtons, Usbd480Panel], ids);
    }
}
