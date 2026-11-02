import { importProjectText, exportOriginalText } from "../adapters/SafeImport.js";
/** DS-12E browser project manager; import/export only, no validation or rendering. */
export class ProjectManager {
  #project=null; #fileName=null; #importRecord=null;
  get project(){return this.#project;}
  get fileName(){return this.#fileName;}
  get importRecord(){return this.#importRecord;}
  async loadFile(file){
    if(!(file instanceof File)) throw new TypeError("A browser File is required.");
    const record=importProjectText(await file.text(),{fileName:file.name});
    this.#project=record.document; this.#fileName=file.name; this.#importRecord=record;
    return this.#project;
  }
  exportOriginal(){if(!this.#importRecord)throw new Error("No project is loaded.");return exportOriginalText(this.#importRecord);}
  clear(){this.#project=null;this.#fileName=null;this.#importRecord=null;}
}
