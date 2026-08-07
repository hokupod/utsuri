import App from "./App.svelte";
import "./styles.css";
import { mount } from "svelte";

const target = document.querySelector<HTMLElement>("[data-utsuri-app]");
if (target) mount(App, { target });
