declare module "pngjs" {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;

    constructor(options: { width: number; height: number; fill?: boolean });

    static sync: {
      read(bytes: Buffer): PNG;
      write(image: PNG): Buffer;
    };
  }
}
