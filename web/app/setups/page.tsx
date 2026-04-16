import {
  Badge,
  Button,
  Card,
  CardContent,
  PageHeader,
} from '@sprint/ui'

const setups = [
  {
    name: 'SPA_WET_SAFE',
    car: 'McLaren 720S GT3 EVO',
    track: 'Spa-Francorchamps',
    author: 'krato',
    lap: '2:15.482',
    tags: ['WET', 'ENDURANCE'],
  },
  {
    name: 'MONZA_QUALI_V3',
    car: 'Ferrari 296 GT3',
    track: 'Monza',
    author: 'Marco',
    lap: '1:47.931',
    tags: ['LOW_DRAG', 'QUALI'],
  },
  {
    name: 'IMOLA_RACE_BASE',
    car: 'BMW M4 GT3',
    track: 'Imola',
    author: 'krato',
    lap: '1:41.267',
    tags: ['STINT', 'SAFE_REARS'],
  },
  {
    name: 'BATHURST_NIGHT',
    car: 'Audi R8 LMS Evo II',
    track: 'Mount Panorama',
    author: 'Nina',
    lap: '2:03.908',
    tags: ['NIGHT', 'CURB_SAFE'],
  },
  {
    name: 'PAUL_RICARD_FAST_1',
    car: 'Porsche 992 GT3 R',
    track: 'Paul Ricard',
    author: 'krato',
    lap: '1:54.411',
    tags: ['FAST', 'LOW_FUEL'],
  },
  {
    name: 'NURB_SPRINT_TC1',
    car: 'Lamborghini Huracan GT3 EVO2',
    track: 'Nurburgring Sprint',
    author: 'Elena',
    lap: '1:27.404',
    tags: ['TC_SAFE', 'AGGRESSIVE'],
  },
]

export default function Setups() {
  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        heading="SETUPS"
        caption="Track-tested car baselines synchronized from desktop and remote collaborators."
        actions={<Button type="button" variant="outline" size="sm">UPLOAD_SETUP</Button>}
      />

      <div className="flex-1 space-y-6 px-6 py-6">
        <section className="space-y-3">
          <h3 className="terminal-header text-[10px] font-bold text-text-muted">
            SETUP_LIBRARY
          </h3>
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {setups.map((setup) => (
              <Card key={setup.name} size="sm">
                <CardContent className="space-y-4 py-4">
                  <div className="space-y-1">
                    <p className="terminal-header text-[11px] font-bold text-foreground">
                      {setup.name}
                    </p>
                    <p className="status-readout text-[10px] text-text-muted">
                      {setup.car} · {setup.track}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="terminal-header text-[10px] font-bold text-text-muted">
                        AUTHOR
                      </p>
                      <p className="mt-1 text-sm text-foreground">{setup.author}</p>
                    </div>
                    <div>
                      <p className="terminal-header text-[10px] font-bold text-text-muted">
                        REF_LAP
                      </p>
                      <p className="mt-1 text-lg font-bold font-mono tabular-nums text-foreground">
                        {setup.lap}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {setup.tags.map((tag, index) => (
                      <Badge
                        key={tag}
                        variant={index === 0 ? 'default' : 'outline'}
                      >
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
