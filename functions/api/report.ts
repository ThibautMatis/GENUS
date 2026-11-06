import { handleReport, type PagesFunction } from "../../server/handlers";

export const onRequestPost: PagesFunction = ({ request, env }) => handleReport(request, env);
