package dashboard

import "github.com/kratofl/sprint/app/internal/commands"

// Dashboard commands — fired by input bindings or direct app actions.
const (
	CmdNextDashPage commands.Command = "dash.page.next"
	CmdPrevDashPage commands.Command = "dash.page.prev"
	CmdSetTargetLap commands.Command = "dash.target.set"
)

func init() {
	commands.RegisterMeta(CmdNextDashPage, "Next Dash Page", "Dashboard", true, true)
	commands.RegisterMeta(CmdPrevDashPage, "Prev Dash Page", "Dashboard", true, true)
	commands.RegisterMeta(CmdSetTargetLap, "Set Target Lap", "Dashboard", true, false)
}
