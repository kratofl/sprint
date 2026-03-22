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

