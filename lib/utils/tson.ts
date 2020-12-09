
import * as Typeson from 'typeson-registry/dist/all.js';

const {presets: {structuredCloningThrowing}} = Typeson;

export const TSON = new Typeson().register([
    structuredCloningThrowing
]);
