import { handleHealth, type PagesFunction } from "../../server/handlers";

export const onRequestGet: PagesFunction = ({ env }) => handleHealth(env);
