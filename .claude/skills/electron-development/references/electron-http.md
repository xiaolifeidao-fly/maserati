```typescript
import { getData, getDataList, getPage, instance } from "@utils/axios";

// 查询单条记录（自动反序列化为类实例）
const user = await getData(UserDTO, "/api/users/1");

// 查询列表
const users = await getDataList(UserDTO, "/api/users", { status: "active" });

// 分页查询
const page = await getPage(UserDTO, "/api/users", { page: 1, size: 10 });
// page.data: UserDTO[], page.total: number

// 直接使用 axios 实例（POST 等操作）
const result = await instance.post("/api/users", { name: "test" });
```
