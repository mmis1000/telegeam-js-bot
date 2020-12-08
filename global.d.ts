declare module 'typeson-registry/dist/all.js' {
    declare class TypesonRegistryDistAll {
        constructor() {}
        register(defs: any[]): typeof JSON
    }
    
    declare module TypesonRegistryDistAll {
        const presets: Record<string, any>
    }
    
    export = TypesonRegistryDistAll
};