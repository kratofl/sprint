export namespace color {
	
	export class RGBA {
	    R: number;
	    G: number;
	    B: number;
	    A: number;
	
	    static createFrom(source: any = {}) {
	        return new RGBA(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.R = source["R"];
	        this.G = source["G"];
	        this.B = source["B"];
	        this.A = source["A"];
	    }
	}

}

export namespace commands {
	
	export class CommandMeta {
	    id: string;
	    label: string;
	    category: string;
	    capturable: boolean;
	    deviceOnly: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CommandMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.category = source["category"];
	        this.capturable = source["capturable"];
	        this.deviceOnly = source["deviceOnly"];
	    }
	}

}

export namespace dashboard {
	
	export class AlertConfig {
	    tcChange: boolean;
	    absChange: boolean;
	    engineMapChange: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AlertConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.tcChange = source["tcChange"];
	        this.absChange = source["absChange"];
	        this.engineMapChange = source["engineMapChange"];
	    }
	}
	export class DashWidget {
	    id: string;
	    type: string;
	    col: number;
	    row: number;
	    colSpan: number;
	    rowSpan: number;
	    config?: Record<string, any>;
	    panelRules?: widgets.ConditionalRule[];
	    styleOverrides?: Record<string, color.RGBA>;
	
	    static createFrom(source: any = {}) {
	        return new DashWidget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.col = source["col"];
	        this.row = source["row"];
	        this.colSpan = source["colSpan"];
	        this.rowSpan = source["rowSpan"];
	        this.config = source["config"];
	        this.panelRules = this.convertValues(source["panelRules"], widgets.ConditionalRule);
	        this.styleOverrides = this.convertValues(source["styleOverrides"], color.RGBA, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DashPage {
	    id: string;
	    name: string;
	    widgets: DashWidget[];
	
	    static createFrom(source: any = {}) {
	        return new DashPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.widgets = this.convertValues(source["widgets"], DashWidget);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DashLayout {
	    id: string;
	    name: string;
	    default: boolean;
	    gridCols: number;
	    gridRows: number;
	    idlePage: DashPage;
	    pages: DashPage[];
	    alerts: AlertConfig;
	    theme?: widgets.DashTheme;
	    domainPalette?: widgets.DomainPalette;
	
	    static createFrom(source: any = {}) {
	        return new DashLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.default = source["default"];
	        this.gridCols = source["gridCols"];
	        this.gridRows = source["gridRows"];
	        this.idlePage = this.convertValues(source["idlePage"], DashPage);
	        this.pages = this.convertValues(source["pages"], DashPage);
	        this.alerts = this.convertValues(source["alerts"], AlertConfig);
	        this.theme = this.convertValues(source["theme"], widgets.DashTheme);
	        this.domainPalette = this.convertValues(source["domainPalette"], widgets.DomainPalette);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class GlobalDashSettings {
	    theme: widgets.DashTheme;
	    domainPalette: widgets.DomainPalette;
	
	    static createFrom(source: any = {}) {
	        return new GlobalDashSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = this.convertValues(source["theme"], widgets.DashTheme);
	        this.domainPalette = this.convertValues(source["domainPalette"], widgets.DomainPalette);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LayoutMeta {
	    id: string;
	    name: string;
	    default: boolean;
	    pageCount: number;
	    gridCols: number;
	    gridRows: number;
	    previewAvailable: boolean;
	
	    static createFrom(source: any = {}) {
	        return new LayoutMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.default = source["default"];
	        this.pageCount = source["pageCount"];
	        this.gridCols = source["gridCols"];
	        this.gridRows = source["gridRows"];
	        this.previewAvailable = source["previewAvailable"];
	    }
	}

}

export namespace devices {
	
	export class DeviceBinding {
	    button: number;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new DeviceBinding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.button = source["button"];
	        this.command = source["command"];
	    }
	}
	export class CatalogEntry {
	    id: string;
	    name: string;
	    description: string;
	    type: string;
	    vid: number;
	    pid: number;
	    width: number;
	    height: number;
	    rotation: number;
	    offset_x?: number;
	    offset_y?: number;
	    driver: string;
	    purpose?: string;
	    bindings?: DeviceBinding[];
	
	    static createFrom(source: any = {}) {
	        return new CatalogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.type = source["type"];
	        this.vid = source["vid"];
	        this.pid = source["pid"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.rotation = source["rotation"];
	        this.offset_x = source["offset_x"];
	        this.offset_y = source["offset_y"];
	        this.driver = source["driver"];
	        this.purpose = source["purpose"];
	        this.bindings = this.convertValues(source["bindings"], DeviceBinding);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DetectedScreen {
	    vid: number;
	    pid: number;
	    serial?: string;
	    width: number;
	    height: number;
	    description: string;
	    driver: string;
	
	    static createFrom(source: any = {}) {
	        return new DetectedScreen(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vid = source["vid"];
	        this.pid = source["pid"];
	        this.serial = source["serial"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.description = source["description"];
	        this.driver = source["driver"];
	    }
	}
	
	export class SavedDevice {
	    vid: number;
	    pid: number;
	    serial?: string;
	    type?: string;
	    width: number;
	    height: number;
	    name: string;
	    rotation: number;
	    target_fps?: number;
	    offset_x?: number;
	    offset_y?: number;
	    driver: string;
	    dash_id?: string;
	    purpose?: string;
	    purpose_config?: number[];
	    bindings?: DeviceBinding[];
	    disabled?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new SavedDevice(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vid = source["vid"];
	        this.pid = source["pid"];
	        this.serial = source["serial"];
	        this.type = source["type"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.name = source["name"];
	        this.rotation = source["rotation"];
	        this.target_fps = source["target_fps"];
	        this.offset_x = source["offset_x"];
	        this.offset_y = source["offset_y"];
	        this.driver = source["driver"];
	        this.dash_id = source["dash_id"];
	        this.purpose = source["purpose"];
	        this.purpose_config = source["purpose_config"];
	        this.bindings = this.convertValues(source["bindings"], DeviceBinding);
	        this.disabled = source["disabled"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace input {
	
	export class Binding {
	    button: number;
	    command: string;
	
	    static createFrom(source: any = {}) {
	        return new Binding(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.button = source["button"];
	        this.command = source["command"];
	    }
	}
	export class Config {
	    bindings: Binding[];
	
	    static createFrom(source: any = {}) {
	        return new Config(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.bindings = this.convertValues(source["bindings"], Binding);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace settings {
	
	export class Settings {
	    updateChannel: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.updateChannel = source["updateChannel"];
	    }
	}

}

export namespace updater {
	
	export class ReleaseInfo {
	    version: string;
	    downloadURL: string;
	    releaseNotes: string;
	    isPrerelease: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ReleaseInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.version = source["version"];
	        this.downloadURL = source["downloadURL"];
	        this.releaseNotes = source["releaseNotes"];
	        this.isPrerelease = source["isPrerelease"];
	    }
	}

}

export namespace widgets {
	
	export class ConditionalRule {
	    property: string;
	    op: string;
	    threshold: number;
	    color: string;
	    alpha?: number;
	
	    static createFrom(source: any = {}) {
	        return new ConditionalRule(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.property = source["property"];
	        this.op = source["op"];
	        this.threshold = source["threshold"];
	        this.color = source["color"];
	        this.alpha = source["alpha"];
	    }
	}
	export class Option {
	    value: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new Option(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.value = source["value"];
	        this.label = source["label"];
	    }
	}
	export class ConfigDef {
	    key: string;
	    label: string;
	    type: string;
	    options?: Option[];
	    default: string;
	
	    static createFrom(source: any = {}) {
	        return new ConfigDef(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.label = source["label"];
	        this.type = source["type"];
	        this.options = this.convertValues(source["options"], Option);
	        this.default = source["default"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DashTheme {
	    primary: color.RGBA;
	    accent: color.RGBA;
	    fg: color.RGBA;
	    muted: color.RGBA;
	    muted2: color.RGBA;
	    success: color.RGBA;
	    warning: color.RGBA;
	    danger: color.RGBA;
	    surface: color.RGBA;
	    bg: color.RGBA;
	    border: color.RGBA;
	    rpmRed: color.RGBA;
	
	    static createFrom(source: any = {}) {
	        return new DashTheme(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.primary = this.convertValues(source["primary"], color.RGBA);
	        this.accent = this.convertValues(source["accent"], color.RGBA);
	        this.fg = this.convertValues(source["fg"], color.RGBA);
	        this.muted = this.convertValues(source["muted"], color.RGBA);
	        this.muted2 = this.convertValues(source["muted2"], color.RGBA);
	        this.success = this.convertValues(source["success"], color.RGBA);
	        this.warning = this.convertValues(source["warning"], color.RGBA);
	        this.danger = this.convertValues(source["danger"], color.RGBA);
	        this.surface = this.convertValues(source["surface"], color.RGBA);
	        this.bg = this.convertValues(source["bg"], color.RGBA);
	        this.border = this.convertValues(source["border"], color.RGBA);
	        this.rpmRed = this.convertValues(source["rpmRed"], color.RGBA);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DomainPalette {
	    abs: color.RGBA;
	    tc: color.RGBA;
	    brakeBias: color.RGBA;
	    energy: color.RGBA;
	    motor: color.RGBA;
	    brakeMig: color.RGBA;
	
	    static createFrom(source: any = {}) {
	        return new DomainPalette(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.abs = this.convertValues(source["abs"], color.RGBA);
	        this.tc = this.convertValues(source["tc"], color.RGBA);
	        this.brakeBias = this.convertValues(source["brakeBias"], color.RGBA);
	        this.energy = this.convertValues(source["energy"], color.RGBA);
	        this.motor = this.convertValues(source["motor"], color.RGBA);
	        this.brakeMig = this.convertValues(source["brakeMig"], color.RGBA);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class WidgetMeta {
	    type: string;
	    label: string;
	    category: string;
	    categoryLabel: string;
	    configDefs?: ConfigDef[];
	    defaultColSpan: number;
	    defaultRowSpan: number;
	    idleCapable: boolean;
	    defaultUpdateHz: number;
	    defaultPanelRules?: ConditionalRule[];
	
	    static createFrom(source: any = {}) {
	        return new WidgetMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.label = source["label"];
	        this.category = source["category"];
	        this.categoryLabel = source["categoryLabel"];
	        this.configDefs = this.convertValues(source["configDefs"], ConfigDef);
	        this.defaultColSpan = source["defaultColSpan"];
	        this.defaultRowSpan = source["defaultRowSpan"];
	        this.idleCapable = source["idleCapable"];
	        this.defaultUpdateHz = source["defaultUpdateHz"];
	        this.defaultPanelRules = this.convertValues(source["defaultPanelRules"], ConditionalRule);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

