
import express from "express";
import { CookieOptions } from "express";

export enum Method {
  get = "get",
  post = "post",
  patch = "patch",
  put = "put",
  delete = "delete",
};

export type IRouterResolve = (request: IRouterRequest, response?: IRouterResponse) => Promise<any> | any;

export interface ILog {
  error: (...params: string[]) => void;
}

export interface IRoute {
  method: Method;
  path: string;
  resolves?: IRouterResolve[];
  action?: string;
  callback?: (...params: any[]) => Promise<IResult<any>>;
}

export interface IError {
  status?: number;
  name?: string;
  message?: string;
  details?: object;
}

export interface IRouter {
  debug: boolean,
  controller?: object;
  onError?: (error: Error) => IError;
  log: ILog;
  routes: IRoute[];
}

export interface ICookie {
  value: string;
  options: CookieOptions;
}

export interface IResult<T> {
  json?: T;
  binary?: Buffer;
  cookies?: {[key: string]: ICookie};
  headers?: {[key: string]: string};
  redirect?: string;
  status?: number;
  count?: number;
  debug?: boolean;
  content?: string;
  text?: string;
  stream?: NodeJS.ReadableStream;
}

export interface IRouterRequest extends express.Request {
  files: {[key: string]: File};
}

export interface IRouterResponse extends express.Response {}

function handler(
  router: express.Router,
  method: string,
  path: string,
  listener: (request: IRouterRequest, response: IRouterResponse) => void,
) {
  switch (method) {
    case Method.get: {
      return router.get(path, listener);
    }
    case Method.post: {
      return router.post(path, listener);
    }
    case Method.patch: {
      return router.patch(path, listener);
    }
    case Method.put: {
      return router.put(path, listener);
    }
    case Method.delete: {
      return router.delete(path, listener);
    }
  }
}

export function createRouter(params: IRouter) {
  const router: express.Router = express.Router();
  const controller: {[key: string]: any} = params.controller;

  params.routes.forEach((route: IRoute) => {
    handler(router, route.method, route.path, (request: IRouterRequest, response: IRouterResponse) => {
      const time = Date.now();
      const promises: Array<Promise<any>> = [
        Promise.resolve(request),
      ];
      route.resolves.forEach((resolve: IRouterResolve) => {
        promises.push(resolve(request, response));
      });
      Promise.all(promises).then((results: any[]) => {
        if (route.action) {
          return controller[route.action].apply(controller, results);
        }
        return route.callback(...results);
      }).then((result: IResult<any>) => {
        if (typeof result.cookies === "object") {
          Object.keys(result.cookies).forEach((key) => {
            const cookie: ICookie = result.cookies[key];
            response.cookie(key, cookie.value, cookie.options);
          });
        }

        if (typeof result.headers === "object") {
          Object.keys(result.headers).forEach((key) => {
            const header = result.headers[key];
            response.header(key, header);
          });
        }

        if (typeof result.redirect === "string") {
          response.redirect(result.redirect);
          return;
        }

        if (typeof result.status === "number") {
          response.status(result.status);
        } else {
          response.status(200);
        }

        if (typeof result.count === "number") {
          response.header("X-Total-Count", result.count.toString());
        }

        if (params.debug) {
          response.header("X-Request-Duration", (Date.now() - time).toString());
        }

        if (result.binary) {
          response.end(result.binary);
        } else if (typeof result.json === "object") {
          const json: any = result.json;
          if (result.json) {
            if (params.debug && result.debug) {
              json["debug"] = result.debug;
            }
          }
          response.json(json);
        } else if (typeof result.text === "string") {
          response.end(result.text);
        } else if (typeof result.content === "string") {
          const content = result.content;
          response.contentType("text/html; charset=UTF-8");
          response.end(content);
        } else if (typeof result.stream === "object") {
          result.stream.pipe(response);

          result.stream.on("end", () => {
            response.end();
          });
        } else {
          response.status(400);
          response.json({
            error: {
              name: "badRequest",
              message: "Bad Request",
            },
          });
        }
      }).catch((error) => {
        if (error && typeof params.onError === "function") {
          const errorData = params.onError(error);
          if (errorData.status) {
            response.status(errorData.status);
          }
          response.json({
            error: {
              name: errorData.name,
              message: errorData.message,
              details: errorData.details,
            },
          });
          return;
        }

        params.log.error("[path-router-express]", error);
        response.status(500);
        response.json({
          error: {
            name: "internalError",
            message: error.message || "Internal Error",
          },
        });
      });
    });
  });
  return router;
}
