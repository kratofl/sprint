export namespace commands {
	
	export class CommandMeta {
	    id: string;
	    label: string;
	    category: string;
	
	    static createFrom(source: any = {}) {
	        return new CommandMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.category = source["category"];
	    }
	}

}

export namespace dashboard {
	
	export class DashWidget {
	    id: string;
	    type: string;
	    x: number;
	    y: number;
	    w: number;
	    h: number;
	
	    static createFrom(source: any = {}) {
	        return new DashWidget(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.type = source["type"];
	        this.x = source["x"];
	        this.y = source["y"];
	        this.w = source["w"];
	        this.h = source["h"];
	    }
	}
	export class DashLayout {
	    widgets: DashWidget[];
	
	    static createFrom(source: any = {}) {
	        return new DashLayout(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
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

}

export namespace devices {
	
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
	export class SavedScreen {
	    vid: number;
	    pid: number;
	    serial?: string;
	    width: number;
	    height: number;
	    name: string;
	    rotation: number;
	    driver: string;
	
	    static createFrom(source: any = {}) {
	        return new SavedScreen(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.vid = source["vid"];
	        this.pid = source["pid"];
	        this.serial = source["serial"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.name = source["name"];
	        this.rotation = source["rotation"];
	        this.driver = source["driver"];
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

export namespace widgets {
	
	export class WidgetMeta {
	    type: string;
	    label: string;
	    category: string;
	
	    static createFrom(source: any = {}) {
	        return new WidgetMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.type = source["type"];
	        this.label = source["label"];
	        this.category = source["category"];
	    }
	}

}

