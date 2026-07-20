import { createRestDataProvider } from "@pfg/admin-ui-core/dataProvider";
import { adminApiUrl, adminRequest } from "./api";

export const dataProvider = createRestDataProvider({ adminApiUrl, adminRequest });
