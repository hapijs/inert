import { defineConfig, globalIgnores } from 'eslint/config';
import HapiEslintPlugin from '@hapi/eslint-plugin';

export default defineConfig([
    ...HapiEslintPlugin.configs.module,
    {
        languageOptions: {
            globals: {
                Crypto: 'off',
                File: 'off'
            }
        }
    },
    globalIgnores([
        'test/directory/*',
        'test/file/*'
    ])
]);
