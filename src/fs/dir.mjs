import fsSync from "fs";
import fsPromises from "fs/promises";
import path from "path";

async function clear(folderPath = ".") {
  const items = await fsPromises.readdir(folderPath);

  for (const item of items) {
    if (item === ".git") {
      continue;
    }

    const fullPath = path.join(folderPath, item);
    await fsPromises.rm(fullPath, {
      recursive: true,
      force: true,
    });
  }
}

export function create(path) {
  fsSync.mkdirSync(path, { recursive: true });
}

export async function hasFiles(dirPath = ".") {
  const items = await fsPromises.readdir(dirPath);
  return items.some((item) => item !== ".git");
}

export default { clear, create, hasFiles };
