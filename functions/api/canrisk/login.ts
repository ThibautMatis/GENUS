import { handleCanRiskLogin, type PagesFunction } from "../../../server/handlers";

export const onRequestPost: PagesFunction = ({ request, env }) => handleCanRiskLogin(request, env);
