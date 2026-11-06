// Cloudflare Pages : protège tout le site (pages et API) par le mot de passe GENUS_PASSWORD.
import { checkAccess, type PagesFunction } from "../server/handlers";

export const onRequest: PagesFunction = async ({ request, env, next }) => checkAccess(request, env) ?? next();
