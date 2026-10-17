import { dataPath } from '../../utils/paths.js'
import path from 'node:path'
export const runtimeDir = path.resolve(process.env.IQIYI_VOD_RUNTIME_DIR || dataPath('iqiyi-vod/.runtime'))
// Child workers receive only this module's private runtime directory.
process.env.IQIYI_VOD_RUNTIME_DIR = runtimeDir
