import "unbundled-runtime-package";
export { value } from "unbundled-export-package";

const moduleName = "computed-runtime-package";
void import(moduleName);
// eslint-disable-next-line @typescript-eslint/no-require-imports
require(moduleName);
