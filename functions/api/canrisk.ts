import { handleCanRisk, type PagesFunction } from "../../server/handlers";

export const onRequestPost: PagesFunction = ({ request, env }) => handleCanRisk(request, env);
