/// <reference types="@figma/plugin-typings" />

figma.showUI(__html__, { width: 300, height: 565 });

// API Availability
const hasVariablesAPI = Boolean(figma.variables);
const hasGetLocalVariables = Boolean(hasVariablesAPI && figma.variables.getLocalVariablesAsync);
const hasGetLocalVariableCollections = Boolean(hasVariablesAPI && figma.variables.getLocalVariableCollectionsAsync);
const hasTeamLibraryAPI = Boolean(figma.teamLibrary && figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync && figma.teamLibrary.getVariablesInLibraryCollectionAsync);
const hasImportVariableByKey = Boolean(hasVariablesAPI && figma.variables.importVariableByKeyAsync);


console.log("API availability check:");
console.log("- Variables API:", hasVariablesAPI);
console.log("- getLocalVariablesAsync:", hasGetLocalVariables);
console.log("- getLocalVariableCollectionsAsync:", hasGetLocalVariableCollections);
console.log("- Team Library API (for library variables):", hasTeamLibraryAPI);
console.log("- Import Variable By Key Async:", hasImportVariableByKey);


figma.ui.postMessage({
  type: 'api-check',
  hasVariables: hasVariablesAPI,
  hasGetLocalVariables: hasGetLocalVariables,
  hasGetLocalCollections: hasGetLocalVariableCollections,
  hasTeamLibraryAPI: hasTeamLibraryAPI,
  hasImportVariableByKey: hasImportVariableByKey,
});

interface SpacingToken {
  id: string; // ID of the (potentially imported) variable
  key: string; // Original key of the variable
  name: string;
  value: number;
  variableObject: Variable; // The actual Variable object - THIS IS KEY
}

// Specific types for nodes that support Auto Layout properties we care about
type AutoLayoutNode = FrameNode | ComponentNode | InstanceNode;

// Specific types for properties we can bind spacing variables to.
type IndividualSpacingBindableNodeField =
  | 'itemSpacing'
  | 'paddingTop'
  | 'paddingBottom'
  | 'paddingLeft'
  | 'paddingRight';

// Union type for properties that can be checked for bindings
type CheckableBindableNodeField = IndividualSpacingBindableNodeField;


async function getAllVariablesAndImportLibraries(): Promise<Variable[]> {
  if (!hasVariablesAPI || !hasImportVariableByKey) {
    console.warn("Variables API or importVariableByKeyAsync not available. Cannot fetch all variables.");
    return [];
  }

  const allVariables: Variable[] = [];
  const processedVariableKeys = new Set<string>();

  // 1. Get Local Variables
  if (hasGetLocalVariables) {
    try {
      console.log("Fetching local variables...");
      const localVariables = await figma.variables.getLocalVariablesAsync();
      console.log(`Found ${localVariables.length} local variables.`);
      localVariables.forEach(v => {
        if (!processedVariableKeys.has(v.key)) {
          allVariables.push(v);
          processedVariableKeys.add(v.key);
        }
      });
    } catch (error) {
      console.error("Error getting local variables:", error);
    }
  }

  // 2. Get Variables from Enabled Libraries
  if (hasTeamLibraryAPI) {
    try {
      console.log("Fetching variables from enabled libraries...");
      const libraryCollections = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
      console.log(`Found ${libraryCollections.length} available library variable collections.`);

      for (const libCollection of libraryCollections) {
        const libraryVariablesInCollection = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollection.key);
        for (const libVarStub of libraryVariablesInCollection) {
          if (!processedVariableKeys.has(libVarStub.key)) {
            try {
              const importedVariable = await figma.variables.importVariableByKeyAsync(libVarStub.key);
              allVariables.push(importedVariable);
              processedVariableKeys.add(importedVariable.key);
            } catch (importError) {
              console.error(`Error importing library variable '${libVarStub.name}' (key: ${libVarStub.key}):`, importError);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error getting library variables:", error);
    }
  }
  console.log(`Total unique variables processed (local + imported library): ${allVariables.length}`);
  return allVariables;
}

async function getSpacingVariables(): Promise<SpacingToken[]> {
  console.log("Getting all variables (local and imported library)...");
  const allResolvedVariables = await getAllVariablesAndImportLibraries();
  console.log(`Processing ${allResolvedVariables.length} variables for spacing tokens.`);

  const spacingTokens: SpacingToken[] = [];

  for (const variable of allResolvedVariables) {
    if (variable.resolvedType !== 'FLOAT') {
      continue;
    }

    const variableName = variable.name;
    const modeIds = Object.keys(variable.valuesByMode);
    if (modeIds.length === 0) {
        continue;
    }
    const firstModeId = modeIds[0];
    const variableValue = variable.valuesByMode[firstModeId];

    if (typeof variableValue === 'number' && variableValue >= 0) {
      const isSpacingName = /space|spacing|gap|padding|margin|size|grid/i.test(variableName);
      if (isSpacingName) {
        spacingTokens.push({
          id: variable.id, // The ID of the Variable object
          key: variable.key,
          name: variableName,
          value: variableValue,
          variableObject: variable, // Store the entire Variable object
        });
      }
    }
  }

  console.log(`Total spacing tokens found: ${spacingTokens.length}`);
  spacingTokens.forEach(token => {
    console.log(`- Spacing Token: ${token.name}: ${token.value}px (ID: ${token.id}, Key: ${token.key})`);
  });
  return spacingTokens;
}

interface SpacingIssue {
  node: AutoLayoutNode;
  property: string;
  currentValue: number;
  matchingToken: SpacingToken | null; // This will hold the full token object
  message: string;
}

function isAutoLayoutNode(node: SceneNode): node is AutoLayoutNode {
    return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
}

async function findSpacingIssues(): Promise<SpacingIssue[]> {
  const spacingTokens = await getSpacingVariables();
  const issues: SpacingIssue[] = [];

  function isIndividualPaddingBound(node: AutoLayoutNode, propertyName: CheckableBindableNodeField): boolean {
    try {
        return node.boundVariables?.[propertyName] !== undefined;
    } catch (e) {
        console.warn(`Could not check boundVariables for ${node.name}.${propertyName}:`, e);
        return false;
    }
  }

  function isHorizontalPaddingBound(node: AutoLayoutNode): boolean {
    return isIndividualPaddingBound(node, 'paddingLeft') && isIndividualPaddingBound(node, 'paddingRight');
  }

  function isVerticalPaddingBound(node: AutoLayoutNode): boolean {
    return isIndividualPaddingBound(node, 'paddingTop') && isIndividualPaddingBound(node, 'paddingBottom');
  }

  function findMatchingTokenByValue(value: number): SpacingToken | null {
    if (spacingTokens.length === 0) return null;
    // Find the token that has the exact value
    return spacingTokens.find(token => token.value === value) || null;
  }

  function checkNode(node: SceneNode) {
    if (isAutoLayoutNode(node)) {
      if (node.layoutMode !== "NONE") {
        if (node.itemSpacing !== undefined && node.itemSpacing > 0 && !isIndividualPaddingBound(node, 'itemSpacing')) {
          const token = findMatchingTokenByValue(node.itemSpacing);
          issues.push({
            node: node,
            property: "itemSpacing",
            currentValue: node.itemSpacing,
            matchingToken: token, // Store the full token
            message: token ? `Map to ${token.name} (${token.value}px)` : `No exact token for ${node.itemSpacing}px gap.`,
          });
        }

        const { paddingTop, paddingBottom, paddingLeft, paddingRight } = node;
        const allPaddingsSameAndPositive = paddingTop > 0 && paddingTop === paddingBottom && paddingTop === paddingLeft && paddingTop === paddingRight;

        if (allPaddingsSameAndPositive &&
            !isIndividualPaddingBound(node, 'paddingTop') &&
            !isIndividualPaddingBound(node, 'paddingBottom') &&
            !isIndividualPaddingBound(node, 'paddingLeft') &&
            !isIndividualPaddingBound(node, 'paddingRight')
           ) {
          const token = findMatchingTokenByValue(paddingTop);
          issues.push({ node, property: "paddingAll", currentValue: paddingTop, matchingToken: token, message: token ? `Map all padding to ${token.name}`: `No token for ${paddingTop}px uniform padding.`});
        } else {
          if (paddingLeft > 0 && paddingLeft === paddingRight && !allPaddingsSameAndPositive && !isHorizontalPaddingBound(node)) {
            const token = findMatchingTokenByValue(paddingLeft);
            issues.push({ node, property: "horizontalPadding", currentValue: paddingLeft, matchingToken: token, message: token ? `Map horiz. padding to ${token.name}`: `No token for ${paddingLeft}px horiz. padding.`});
          } else {
            if (paddingLeft > 0 && !isIndividualPaddingBound(node, 'paddingLeft') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
              const token = findMatchingTokenByValue(paddingLeft);
              issues.push({ node, property: "paddingLeft", currentValue: paddingLeft, matchingToken: token, message: token ? `Map left padding to ${token.name}`: `No token for ${paddingLeft}px left padding.`});
            }
            if (paddingRight > 0 && !isIndividualPaddingBound(node, 'paddingRight') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
              const token = findMatchingTokenByValue(paddingRight);
              issues.push({ node, property: "paddingRight", currentValue: paddingRight, matchingToken: token, message: token ? `Map right padding to ${token.name}`: `No token for ${paddingRight}px right padding.`});
            }
          }
          if (paddingTop > 0 && paddingTop === paddingBottom && !allPaddingsSameAndPositive && !isVerticalPaddingBound(node)) {
            const token = findMatchingTokenByValue(paddingTop);
            issues.push({ node, property: "verticalPadding", currentValue: paddingTop, matchingToken: token, message: token ? `Map vert. padding to ${token.name}`: `No token for ${paddingTop}px vert. padding.`});
          } else {
            if (paddingTop > 0 && !isIndividualPaddingBound(node, 'paddingTop') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
              const token = findMatchingTokenByValue(paddingTop);
              issues.push({ node, property: "paddingTop", currentValue: paddingTop, matchingToken: token, message: token ? `Map top padding to ${token.name}`: `No token for ${paddingTop}px top padding.`});
            }
            if (paddingBottom > 0 && !isIndividualPaddingBound(node, 'paddingBottom') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
              const token = findMatchingTokenByValue(paddingBottom);
              issues.push({ node, property: "paddingBottom", currentValue: paddingBottom, matchingToken: token, message: token ? `Map bottom padding to ${token.name}`: `No token for ${paddingBottom}px bottom padding.`});
            }
          }
        }
      }
    }

    if ("children" in node) {
      for (const child of node.children) {
        checkNode(child);
      }
    }
  }

  const nodesToCheck = figma.currentPage.selection.length > 0 ? figma.currentPage.selection : figma.currentPage.children;
  for (const node of nodesToCheck) {
    checkNode(node);
  }

  console.log(`Found ${issues.length} potential spacing issues.`);
  issues.forEach(issue => addMarkerToNode(issue.node, "⚠️ Spacing Issue"));
  return issues;
}


function addMarkerToNode(node: SceneNode, name: string) {
    try {
        const existingMarker = figma.currentPage.findOne(n => n.name === name && n.getPluginData("markerFor") === node.id);
        if (existingMarker) return;

        const indicator = figma.createEllipse();
        indicator.name = name;
        indicator.resize(8, 8);
        indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 } }];
        const absoluteX = node.absoluteTransform[0][2];
        const absoluteY = node.absoluteTransform[1][2];
        indicator.x = absoluteX - 12;
        indicator.y = absoluteY;

        indicator.setPluginData("markerFor", node.id);
        figma.currentPage.appendChild(indicator);
    } catch (e: unknown) {
        let message = 'Unknown error';
        if (e instanceof Error) message = e.message;
        else if (typeof e === 'string') message = e;
        console.error(`Error adding marker to node ${node.name}: ${message}`);
    }
}

// trySetBoundVariable now accepts the full SpacingToken object
async function trySetBoundVariable(
    node: AutoLayoutNode,
    propertyName: IndividualSpacingBindableNodeField,
    token: SpacingToken // Changed from variableId to the full token
): Promise<boolean> {
  try {
    // Pass the actual Variable object from the token
    console.log(`Binding ${node.name}.${propertyName} to variable: ${token.name} (ID: ${token.id})`);
    node.setBoundVariable(propertyName, token.variableObject); // Use token.variableObject

    // Verify using node.boundVariables and the token's ID
    const boundVariableAlias = node.boundVariables?.[propertyName];
    if (boundVariableAlias && boundVariableAlias.id === token.id) { // Compare with token.id
        console.log(`Successfully bound ${propertyName} for ${node.name} to ${token.name}`);
        return true;
    } else {
        console.warn(`Verification failed for ${node.name}.${propertyName}. Bound alias:`, boundVariableAlias, `Expected ID: ${token.id}`);
        return false;
    }

  } catch (e: unknown) {
    let message = 'Unknown error during binding';
    if (e instanceof Error) message = e.message;
    else if (typeof e === 'string') message = e;

    console.error(`Error binding ${propertyName} for node ${node.name} to variable ${token.name} (ID: ${token.id}): ${message}`);
    // Check if the variable object itself might be an issue (though less likely if it came from getSpacingVariables)
    if (!token.variableObject || typeof token.variableObject.key !== 'string') {
        console.error("The provided token.variableObject seems invalid:", token.variableObject);
    }
    return false;
  }
}

async function fixSpacingIssues(): Promise<number> {
  clearMarkers();
  const issues = await findSpacingIssues();
  let fixedCount = 0;

  console.log(`Attempting to fix ${issues.length} spacing issues.`);

  for (const issue of issues) {
    // Ensure matchingToken and its variableObject are valid before proceeding
    if (issue.matchingToken && issue.matchingToken.variableObject) {
      const { node, property, matchingToken } = issue;
      let success = false;

      if (property === "paddingAll") {
        const propsToBind: IndividualSpacingBindableNodeField[] = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'];
        let allSuccess = true;
        for (const p of propsToBind) {
            // Pass the full matchingToken
            if (!await trySetBoundVariable(node, p, matchingToken)) allSuccess = false;
        }
        success = allSuccess;
      } else if (property === "horizontalPadding") {
        // Pass the full matchingToken
        const S1 = await trySetBoundVariable(node, 'paddingLeft', matchingToken);
        const S2 = await trySetBoundVariable(node, 'paddingRight', matchingToken);
        success = S1 && S2;
      } else if (property === "verticalPadding") {
        // Pass the full matchingToken
        const S1 = await trySetBoundVariable(node, 'paddingTop', matchingToken);
        const S2 = await trySetBoundVariable(node, 'paddingBottom', matchingToken);
        success = S1 && S2;
      } else if (property === "itemSpacing" || property === "paddingLeft" || property === "paddingRight" || property === "paddingTop" || property === "paddingBottom" ) {
        // Pass the full matchingToken
        success = await trySetBoundVariable(node, property as IndividualSpacingBindableNodeField, matchingToken);
      }

      if (success) {
        fixedCount++;
      }
    } else if (issue.matchingToken && !issue.matchingToken.variableObject) {
        console.warn(`Skipping issue for ${issue.node.name} property ${issue.property} due to missing variableObject in token:`, issue.matchingToken);
    } else if (!issue.matchingToken) {
        // This case should ideally be handled by the message in SpacingIssue,
        // but good to log if we reach here without a token.
        console.log(`No matching token found for ${issue.node.name} property ${issue.property} with value ${issue.currentValue}px. Cannot fix.`);
    }
  }

  console.log(`Successfully applied ${fixedCount} spacing variable bindings.`);
  if (fixedCount > 0) {
    figma.notify(`Applied ${fixedCount} spacing variable bindings.`);
  } else if (issues.length > 0) {
    figma.notify(`Found ${issues.length} issues, but no matching tokens were applied successfully. Check console for details.`);
  } else {
    figma.notify(`No unlinked spacing values found or fixed.`);
  }
  clearMarkers();
  await findSpacingIssues();

  return fixedCount;
}

function clearMarkers() {
  try {
    const markers = figma.currentPage.children.filter(
        node => node.type === "ELLIPSE" &&
                (node.name === "⚠️ Spacing Issue" || node.name === "🎨 Color Issue") &&
                node.getPluginData("markerFor") !== ""
    );

    let clearedCount = 0;
    markers.forEach(markerNode => {
      if (markerNode.type === "ELLIPSE") {
          markerNode.remove();
          clearedCount++;
      }
    });
    console.log(`Cleared ${clearedCount} markers.`);
    return clearedCount;
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (error instanceof Error) message = error.message;
    else if (typeof error === 'string') message = error;
    console.error(`Error clearing markers: ${message}`);
    return 0;
  }
}

figma.ui.onmessage = async (msg) => {
  console.log("Received message from UI:", msg.type);
  try {
    if (msg.type === 'find-spacing-issues') {
      clearMarkers();
      const issues = await findSpacingIssues();
      const uniqueNodeIds = new Set(issues.map(issue => issue.node.id));
      figma.ui.postMessage({
        type: 'spacing-issues-found',
        count: issues.length,
        nodeCount: uniqueNodeIds.size,
      });
      if (issues.length > 0) {
          figma.notify(`Found ${issues.length} potential spacing issues on ${uniqueNodeIds.size} nodes. Markers added.`);
      } else {
          figma.notify(`No unlinked spacing values found.`);
      }
    } else if (msg.type === 'fix-spacing-issues') {
      const fixedCount = await fixSpacingIssues();
      figma.ui.postMessage({
        type: 'spacing-issues-fixed',
        count: fixedCount
      });
    } else if (msg.type === 'clear-markers') {
      const clearedCount = clearMarkers();
      figma.ui.postMessage({
        type: 'markers-cleared',
        count: clearedCount
      });
      if (clearedCount > 0) figma.notify(`Cleared ${clearedCount} markers.`);
    }
  } catch (error: unknown) {
    let message = 'Unknown error';
    if (error instanceof Error) {
        message = error.message;
    } else if (typeof error === 'string') {
        message = error;
    }
    console.error("Error handling UI message:", message, error);
    figma.notify(`Plugin error: ${message}. Check console.`, { error: true });
    figma.ui.postMessage({ type: 'error', message: message });
  }
};

console.log("Spacing Linter Plugin Loaded (V7). Waiting for UI interaction.");
