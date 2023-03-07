import * as path from 'path';

import { Server, Lifecycle } from '@hapi/hapi';
import * as inert from '../';
import * as Lab from '@hapi/lab';

const { expect: check } = Lab.types;

const server = new Server({
  port: 3000,
  routes: {
    files: {
      relativeTo: path.join(__dirname, 'public'),
    },
  },
});

const provision = async () => {
  await server.register(inert);
  await server.register({ plugin: inert.plugin, options: { etagsCacheMaxSize: 100 } });

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler: {
      directory: {
        path: '.',
        redirectToSlash: true,
        index: true,
      },
    },
  });

  server.route({
    method: 'GET',
    path: '/{param*}',
    handler(request, h) {
      check.type<Function>(h.file);
      return h.file('awesome.png', {
        confine: './images',
      });
    },
  });

  // https://github.com/hapijs/inert#serving-a-single-file
  server.route({
    method: 'GET',
    path: '/{path*}',
    handler: {
      file: 'page.html',
    },
  });

  // https://github.com/hapijs/inert#customized-file-response
  server.route({
    method: 'GET',
    path: '/file',
    handler(request, h) {
      let path = 'plain.txt';
      if (request.headers['x-magic'] === 'sekret') {
        path = 'awesome.png';
      }

      return h.file(path).vary('x-magic');
    },
  });

  const handler: Lifecycle.Method = (request, h) => {
    const response = request.response;
    if (response instanceof Error && response.output.statusCode === 404) {
      return h.file('404.html').code(404);
    }

    return h.continue;
  };

  server.ext('onPostHandler', handler);

  const file: inert.FileHandlerRouteObject = {
    path: '',
    confine: true,
  };

  const directory: inert.DirectoryHandlerRouteObject = {
    path: '',
    listing: true,
  };

  server.route({
    path: '',
    method: 'GET',
    handler: {
      file,
      directory: {
        path() {
          if (Math.random() > 0.5) {
            return '';
          } else if (Math.random() > 0) {
            return [''];
          }
          return new Error('');
        },
      },
    },
    options: { files: { relativeTo: __dirname } },
  });
};
