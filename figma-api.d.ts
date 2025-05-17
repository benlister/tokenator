// figma-api.d.ts

// Define the interfaces for additional Figma API functionality
interface VariableCollection {
    id: string;
    name: string;
    defaultModeId: string;
    modes: Array<{id: string, name: string}>;
    variableIds: string[];
    libraryName?: string;
  }
  
  interface VariableValue {
    type: string;
    value: number | string | {r: number, g: number, b: number, a?: number};
  }
  
  interface Variable {
    id: string;
    name: string;
    key: string;
    variableCollectionId: string;
    resolvedType: string;
    valuesByMode: Record<string, VariableValue | number | string | {r: number, g: number, b: number, a?: number}>;
  }
  
  interface Library {
    type: string;
    name: string;
    id: string;
    loadAsync(): Promise<void>;
  }
  
  // Declare global to extend existing types
  declare global {
    interface PluginAPI {
      getLibraries(): ReadonlyArray<BaseNodeMixin & Library>;
    }
  
    interface VariablesAPI {
      getVariableCollectionsFromLibraryAsync(library: Library): Promise<VariableCollection[]>;
      getVariablesByCollectionIdAsync(collectionId: string): Promise<Variable[]>;
      getVariablesFromLibraryCollectionAsync(collection: VariableCollection): Promise<Variable[]>;
      getLocalVariableCollectionsAsync(): Promise<VariableCollection[]>;
    }
  }
  
  // Export an empty object to make this a module
  export {};