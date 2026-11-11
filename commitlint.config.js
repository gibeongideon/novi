// Every commit subject must start with a task ID from TASKS.md, e.g. "P2.6.2: apply onchange values".
// Housekeeping commits may use "chore:" / "docs:".
export default {
  rules: {
    "task-id-prefix": [2, "always"],
  },
  plugins: [
    {
      rules: {
        "task-id-prefix": ({ header }) => [
          /^(P\d+(\.\d+){1,2}|chore|docs|ci|deps)(\([\w-]+\))?: \S/.test(header ?? ""),
          'Subject must start with a task ID ("P0.4.2: …") or chore:/docs:/ci:/deps:',
        ],
      },
    },
  ],
};
