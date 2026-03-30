```typescript
import { getGlobal, setGlobal, removeGlobal } from "@utils/store/electron";

// 存储数据
setGlobal("userPreferences", { theme: "dark" });

// 读取数据
const prefs = getGlobal("userPreferences");

// 删除数据
removeGlobal("userPreferences");
```