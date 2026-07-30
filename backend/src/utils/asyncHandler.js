/**
 * Wraps an async controller so a rejected promise reaches Express's error
 * handler instead of hanging the request.
 *
 * Express 4 does not catch rejections from async middleware: an unhandled
 * `throw` inside an async function leaves the client waiting until timeout.
 * With every controller wrapped, error handling lives in exactly one place
 * (middlewares/errorHandler.js) and NO controller in this project contains a
 * try/catch block.
 *
 *   exports.list = asyncHandler(async (req, res) => {
 *     const rows = await Department.find();   // a throw here → next(err)
 *     return success(res, { data: rows });
 *   });
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
