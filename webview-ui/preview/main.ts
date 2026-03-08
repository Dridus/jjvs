/**
 * Entry point for the jjvs Preview webview.
 *
 * Mounts the Svelte 5 App component onto document.body.
 * The extension host communicates with this page via postMessage.
 */

import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.body });
