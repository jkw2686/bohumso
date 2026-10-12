import definition from '../shared/professions.json';
export const PROFESSION_VERSION = definition.version;
export const PROFESSION_CONFIG = definition.professions;
export const activeProfessions = Object.entries(PROFESSION_CONFIG).filter(([, value]) => value.intake);
