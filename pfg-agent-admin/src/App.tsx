import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import { Admin, Resource } from "react-admin";
import { authProvider } from "./authProvider";
import { dataProvider } from "./dataProvider";
import { AdminLayout } from "./layout/AdminLayout";
import { LoginPage } from "./LoginPage";
import { ConfigurationList } from "./resources/configuration";
import { adminDarkTheme, adminLightTheme } from "./theme";
export default function App() {
  return (
    <Admin
      title="Prompt for Good Agent Admin"
      dataProvider={dataProvider}
      authProvider={authProvider}
      theme={adminLightTheme}
      darkTheme={adminDarkTheme}
      loginPage={LoginPage}
      layout={AdminLayout}
      requireAuth
    >
      <Resource
        name="configuration"
        list={ConfigurationList}
        icon={SettingsOutlinedIcon}
        options={{ label: "Configuration" }}
      />
    </Admin>
  );
}
