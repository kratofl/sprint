import {
  Button,
  Card, CardContent, CardHeader, CardTitle,
  Tabs, TabsContent, TabsList, TabsTrigger,
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@sprint/ui'

export default function DashEditor() {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dash Editor</h1>
        <Button variant="default" size="sm">
          Save Layout
        </Button>
      </div>

      <div className="flex flex-1 gap-4">
        {/* Canvas area */}
        <Card className="flex-1 min-h-0">
          <CardContent className="flex h-full items-center justify-center">
            <p className="text-sm text-text-muted">Dash canvas — coming soon</p>
          </CardContent>
        </Card>

        {/* Widget panel */}
        <Card className="w-56 flex-shrink-0">
          <CardHeader className="border-b border-border-base">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-text-muted">
              Widgets
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <TooltipProvider>
              <Tabs defaultValue="timing">
                <TabsList variant="line" className="w-full mb-3">
                  <TabsTrigger value="timing" className="flex-1">Timing</TabsTrigger>
                  <TabsTrigger value="car" className="flex-1">Car</TabsTrigger>
                  <TabsTrigger value="race" className="flex-1">Race</TabsTrigger>
                </TabsList>
                <TabsContent value="timing">
                  <div className="space-y-1">
                    {['Lap Time', 'Sector', 'Delta'].map(w => (
                      <Tooltip key={w}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            draggable
                            className="w-full justify-start cursor-grab active:cursor-grabbing"
                          >
                            {w}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Drag onto canvas</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="car">
                  <div className="space-y-1">
                    {['Speed', 'Gear', 'RPM Bar'].map(w => (
                      <Tooltip key={w}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            draggable
                            className="w-full justify-start cursor-grab active:cursor-grabbing"
                          >
                            {w}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Drag onto canvas</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="race">
                  <div className="space-y-1">
                    {['Fuel', 'Tyre Temp'].map(w => (
                      <Tooltip key={w}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            draggable
                            className="w-full justify-start cursor-grab active:cursor-grabbing"
                          >
                            {w}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Drag onto canvas</TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </TooltipProvider>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
