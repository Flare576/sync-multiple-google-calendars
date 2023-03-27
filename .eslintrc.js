// .eslintrc.js example
module.exports = {
  "env": {
      "node": true,
      "es2021": true
  },
  "globals": {
    "CalendarApp": "readonly",
    "Calendar": "readonly",
    "BatchRequest": "readonly",
    "LockService": "readonly",
    "module": "readonly",
    "console": "writable",
  },
  "extends": "eslint:recommended",
  "parserOptions": {
      "ecmaVersion": "latest",
      "sourceType": "module"
  },
  "rules": {
    // "semi": ["error", "always"],
    "semi": ["error", "never"],
  },
}
