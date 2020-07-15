import { noop } from 'lodash';
import { mountRootParcel, registerApplication, start as startSingleSpa } from 'single-spa';
import { FrameworkConfiguration, FrameworkLifeCycles, LoadableApp, MicroApp, RegistrableApp } from './interfaces';
import { loadApp } from './loader';
import { doPrefetchStrategy } from './prefetch';
import { Deferred, toArray } from './utils';

let microApps: RegistrableApp[] = [];

// eslint-disable-next-line import/no-mutable-exports
export let frameworkConfiguration: FrameworkConfiguration = {};
const frameworkStartedDefer = new Deferred<void>();

export function registerMicroApps<T extends object = {}>(
  apps: Array<RegistrableApp<T>>,
  lifeCycles?: FrameworkLifeCycles<T>,
) {
  // Each app only needs to be registered once
  // 每个子应用都只需要注册一次
  const unregisteredApps = apps.filter(app => !microApps.some(registeredApp => registeredApp.name === app.name));
  // 重写注册的子应用列表
  microApps = [...microApps, ...unregisteredApps];

  // 遍历没有注册的子应用，调用singleSpa的注册
  unregisteredApps.forEach(app => {
    const { name, activeRule, loader = noop, props, ...appConfig } = app;

    registerApplication({
      name,
      app: async () => {
        loader(true);
        await frameworkStartedDefer.promise;

        const { mount, ...otherMicroAppConfigs } = await loadApp(
          { name, props, ...appConfig },
          frameworkConfiguration,
          lifeCycles,
        );

        return {
          mount: [async () => loader(true), ...toArray(mount), async () => loader(false)],
          ...otherMicroAppConfigs,
        };
      },
      activeWhen: activeRule,
      customProps: props,
    });
  });
}

export function loadMicroApp<T extends object = {}>(
  app: LoadableApp<T>,
  configuration?: FrameworkConfiguration,
  lifeCycles?: FrameworkLifeCycles<T>,
): MicroApp {
  const { props } = app;
  return mountRootParcel(() => loadApp(app, configuration ?? frameworkConfiguration, lifeCycles), {
    domElement: document.createElement('div'),
    ...props,
  });
}

// 全局的开始函数
export function start(opts: FrameworkConfiguration = {}) {
  frameworkConfiguration = { prefetch: true, singular: true, sandbox: true, ...opts };
  const { prefetch, sandbox, singular, urlRerouteOnly, ...importEntryOpts } = frameworkConfiguration;

  if (prefetch) {
    doPrefetchStrategy(microApps, prefetch, importEntryOpts);
  }

  if (sandbox) {
    if (!window.Proxy) {
      console.warn('[qiankun] Miss window.Proxy, proxySandbox will degenerate into snapshotSandbox');
      // 快照沙箱不支持非 singular 模式
      if (!singular) {
        console.error('[qiankun] singular is forced to be true when sandbox enable but proxySandbox unavailable');
        frameworkConfiguration.singular = true;
      }
    }
  }
  // 开始singlespa并且设置路由改变 就
  startSingleSpa({ urlRerouteOnly });

  frameworkStartedDefer.resolve();
}
