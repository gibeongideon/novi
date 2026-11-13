/** @novi/odoo-expr: evaluator for the Python expressions and domains Odoo puts in view arch. */
export {
  compile,
  type EvalContext,
  type EvalOptions,
  evaluate,
  evaluateBool,
  ExprError,
  isTuple,
  PyDate,
  pyEquals,
  PyFunction,
  type PyValue,
  RelativeDelta,
  safeEvaluate,
  truthy,
  tuple,
} from "./evaluate.js";
export { type BinOp, type CmpOp, ExprSyntaxError, type Node, parse } from "./parse.js";
