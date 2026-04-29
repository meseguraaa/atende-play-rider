// types/css.d.ts

declare module '*.css';
declare module '*.scss';
declare module '*.sass';

declare module '*.module.css' {
    const classes: { [key: string]: string };
    export default classes;
}
