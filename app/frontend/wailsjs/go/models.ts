export namespace devices {
	
	export class WheelModel {
	    ID: string;
	    Name: string;
	    Manufacturer: string;
	    USBVID: number;
	    USBPID: number;
	    ScreenVID: number;
	    ScreenPID: number;
	    ScreenWidth: number;
	    ScreenHeight: number;
	    DefaultBaud: number;
	
	    static createFrom(source: any = {}) {
	        return new WheelModel(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.Manufacturer = source["Manufacturer"];
	        this.USBVID = source["USBVID"];
	        this.USBPID = source["USBPID"];
	        this.ScreenVID = source["ScreenVID"];
	        this.ScreenPID = source["ScreenPID"];
	        this.ScreenWidth = source["ScreenWidth"];
	        this.ScreenHeight = source["ScreenHeight"];
	        this.DefaultBaud = source["DefaultBaud"];
	    }
	}
	export class DetectedPort {
	    name: string;
	    isUsb: boolean;
	    matchedModel?: WheelModel;
	    description: string;
	
	    static createFrom(source: any = {}) {
	        return new DetectedPort(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.isUsb = source["isUsb"];
	        this.matchedModel = this.convertValues(source["matchedModel"], WheelModel);
	        this.description = source["description"];
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
	export class DeviceConfig {
	    id: string;
	    modelId: string;
	    alias?: string;
	    port: string;
	
	    static createFrom(source: any = {}) {
	        return new DeviceConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.modelId = source["modelId"];
	        this.alias = source["alias"];
	        this.port = source["port"];
	    }
	}

}

export namespace setup {
	
	export class Setup {
	    id: string;
	    name: string;
	    car: string;
	    track: string;
	    settings: Record<string, any>;
	
	    static createFrom(source: any = {}) {
	        return new Setup(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.car = source["car"];
	        this.track = source["track"];
	        this.settings = source["settings"];
	    }
	}

}

