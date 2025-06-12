/// <reference types="@figma/plugin-typings" />
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
figma.showUI(__html__, { width: 300, height: 585 });
// API Availability
const hasVariablesAPI = Boolean(figma.variables);
const hasGetLocalVariables = Boolean(hasVariablesAPI && figma.variables.getLocalVariablesAsync);
const hasGetLocalVariableCollections = Boolean(hasVariablesAPI && figma.variables.getLocalVariableCollectionsAsync);
const hasTeamLibraryAPI = Boolean(figma.teamLibrary && figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync && figma.teamLibrary.getVariablesInLibraryCollectionAsync);
const hasImportVariableByKey = Boolean(hasVariablesAPI && figma.variables.importVariableByKeyAsync);
let cachedSpacingTokens = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
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
// Replace your getAllVariablesAndImportLibraries function with this version
function getAllVariablesAndImportLibraries() {
    return __awaiter(this, void 0, void 0, function* () {
        if (!hasVariablesAPI || !hasImportVariableByKey) {
            console.warn("Variables API or importVariableByKeyAsync not available. Cannot fetch all variables.");
            return [];
        }
        const allVariables = [];
        const processedVariableKeys = new Set();
        console.log("Starting optimized variable collection...");
        const startTime = Date.now();
        // 1. Get Local Variables (usually fast)
        if (hasGetLocalVariables) {
            try {
                console.log("Fetching local variables...");
                const localStart = Date.now();
                const localVariables = yield figma.variables.getLocalVariablesAsync();
                const localEnd = Date.now();
                console.log(`Found ${localVariables.length} local variables in ${(localEnd - localStart)}ms`);
                localVariables.forEach(v => {
                    if (!processedVariableKeys.has(v.key)) {
                        allVariables.push(v);
                        processedVariableKeys.add(v.key);
                    }
                });
            }
            catch (error) {
                console.error("Error getting local variables:", error);
            }
        }
        // 2. Get Variables from Enabled Libraries (potentially slow - optimize this part)
        if (hasTeamLibraryAPI) {
            try {
                console.log("Fetching library collections...");
                const libStart = Date.now();
                const libraryCollections = yield figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
                const libCollectionEnd = Date.now();
                console.log(`Found ${libraryCollections.length} library collections in ${(libCollectionEnd - libStart)}ms`);
                // Process collections in batches to avoid overwhelming the API
                const BATCH_SIZE = 5; // Process 5 variables at a time
                for (const libCollection of libraryCollections) {
                    try {
                        const collectionStart = Date.now();
                        const libraryVariablesInCollection = yield figma.teamLibrary.getVariablesInLibraryCollectionAsync(libCollection.key);
                        // Filter to only spacing-related variables by name before importing
                        const spacingVariables = libraryVariablesInCollection.filter(libVar => /space|spacing|gap|padding|margin|size|grid/i.test(libVar.name));
                        console.log(`Collection "${libCollection.name}": ${libraryVariablesInCollection.length} total, ${spacingVariables.length} spacing-related`);
                        // Process in batches
                        for (let i = 0; i < spacingVariables.length; i += BATCH_SIZE) {
                            const batch = spacingVariables.slice(i, i + BATCH_SIZE);
                            const batchPromises = batch.map((libVarStub) => __awaiter(this, void 0, void 0, function* () {
                                if (!processedVariableKeys.has(libVarStub.key)) {
                                    try {
                                        const importedVariable = yield figma.variables.importVariableByKeyAsync(libVarStub.key);
                                        return importedVariable;
                                    }
                                    catch (importError) {
                                        console.error(`Error importing library variable '${libVarStub.name}' (key: ${libVarStub.key}):`, importError);
                                        return null;
                                    }
                                }
                                return null;
                            }));
                            const batchResults = yield Promise.all(batchPromises);
                            batchResults.forEach(variable => {
                                if (variable && !processedVariableKeys.has(variable.key)) {
                                    allVariables.push(variable);
                                    processedVariableKeys.add(variable.key);
                                }
                            });
                            // Small delay between batches to prevent API rate limiting
                            if (i + BATCH_SIZE < spacingVariables.length) {
                                yield new Promise(resolve => setTimeout(resolve, 50));
                            }
                        }
                        const collectionEnd = Date.now();
                        console.log(`Processed collection "${libCollection.name}" in ${(collectionEnd - collectionStart)}ms`);
                    }
                    catch (collectionError) {
                        console.error(`Error processing collection "${libCollection.name}":`, collectionError);
                    }
                }
            }
            catch (error) {
                console.error("Error getting library variables:", error);
            }
        }
        const endTime = Date.now();
        console.log(`Total variable collection completed in ${(endTime - startTime)}ms`);
        console.log(`Total unique variables processed (local + imported library): ${allVariables.length}`);
        return allVariables;
    });
}
function getSpacingVariables() {
    return __awaiter(this, arguments, void 0, function* (forceRefresh = false) {
        const now = Date.now();
        // Return cached results if they're still valid
        if (!forceRefresh && cachedSpacingTokens && (now - cacheTimestamp) < CACHE_DURATION) {
            console.log(`Using cached spacing tokens (${cachedSpacingTokens.length} tokens)`);
            return cachedSpacingTokens;
        }
        console.log("Fetching fresh spacing variables...");
        const allResolvedVariables = yield getAllVariablesAndImportLibraries();
        console.log(`Processing ${allResolvedVariables.length} variables for spacing tokens.`);
        const spacingTokens = [];
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
                        id: variable.id,
                        key: variable.key,
                        name: variableName,
                        value: variableValue,
                        variableObject: variable,
                    });
                }
            }
        }
        // Cache the results
        cachedSpacingTokens = spacingTokens;
        cacheTimestamp = now;
        console.log(`Total spacing tokens found and cached: ${spacingTokens.length}`);
        return spacingTokens;
    });
}
function isAutoLayoutNode(node) {
    return node.type === "FRAME" || node.type === "COMPONENT" || node.type === "INSTANCE";
}
function findSpacingIssues() {
    return __awaiter(this, void 0, void 0, function* () {
        const spacingTokens = yield getSpacingVariables(); // Uses cache by default
        const issues = [];
        // Pre-create a Map for faster token lookup by value
        const tokensByValue = new Map();
        spacingTokens.forEach(token => {
            tokensByValue.set(token.value, token);
        });
        function isIndividualPaddingBound(node, propertyName) {
            var _a;
            try {
                return ((_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName]) !== undefined;
            }
            catch (e) {
                console.warn(`Could not check boundVariables for ${node.name}.${propertyName}:`, e);
                return false;
            }
        }
        function isHorizontalPaddingBound(node) {
            return isIndividualPaddingBound(node, 'paddingLeft') && isIndividualPaddingBound(node, 'paddingRight');
        }
        function isVerticalPaddingBound(node) {
            return isIndividualPaddingBound(node, 'paddingTop') && isIndividualPaddingBound(node, 'paddingBottom');
        }
        // Optimized token lookup using Map
        function findMatchingTokenByValue(value) {
            return tokensByValue.get(value) || null;
        }
        function checkNode(node) {
            if (isAutoLayoutNode(node)) {
                if (node.layoutMode !== "NONE") {
                    // Check itemSpacing
                    if (node.itemSpacing !== undefined && node.itemSpacing > 0 && !isIndividualPaddingBound(node, 'itemSpacing')) {
                        const token = findMatchingTokenByValue(node.itemSpacing);
                        issues.push({
                            node: node,
                            property: "itemSpacing",
                            currentValue: node.itemSpacing,
                            matchingToken: token,
                            message: token ? `Map to ${token.name} (${token.value}px)` : `No exact token for ${node.itemSpacing}px gap.`,
                        });
                        addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                    }
                    // Check padding (existing logic remains the same)
                    const { paddingTop, paddingBottom, paddingLeft, paddingRight } = node;
                    const allPaddingsSameAndPositive = paddingTop > 0 && paddingTop === paddingBottom && paddingTop === paddingLeft && paddingTop === paddingRight;
                    if (allPaddingsSameAndPositive &&
                        !isIndividualPaddingBound(node, 'paddingTop') &&
                        !isIndividualPaddingBound(node, 'paddingBottom') &&
                        !isIndividualPaddingBound(node, 'paddingLeft') &&
                        !isIndividualPaddingBound(node, 'paddingRight')) {
                        const token = findMatchingTokenByValue(paddingTop);
                        issues.push({ node, property: "paddingAll", currentValue: paddingTop, matchingToken: token, message: token ? `Map all padding to ${token.name}` : `No token for ${paddingTop}px uniform padding.` });
                        addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                    }
                    else {
                        // Handle horizontal padding
                        if (paddingLeft > 0 && paddingLeft === paddingRight && !allPaddingsSameAndPositive && !isHorizontalPaddingBound(node)) {
                            const token = findMatchingTokenByValue(paddingLeft);
                            issues.push({ node, property: "horizontalPadding", currentValue: paddingLeft, matchingToken: token, message: token ? `Map horiz. padding to ${token.name}` : `No token for ${paddingLeft}px horiz. padding.` });
                            addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                        }
                        else {
                            // Individual left padding
                            if (paddingLeft > 0 && !isIndividualPaddingBound(node, 'paddingLeft') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingLeft);
                                issues.push({ node, property: "paddingLeft", currentValue: paddingLeft, matchingToken: token, message: token ? `Map left padding to ${token.name}` : `No token for ${paddingLeft}px left padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                            // Individual right padding
                            if (paddingRight > 0 && !isIndividualPaddingBound(node, 'paddingRight') && !allPaddingsSameAndPositive && !(paddingLeft === paddingRight && !isHorizontalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingRight);
                                issues.push({ node, property: "paddingRight", currentValue: paddingRight, matchingToken: token, message: token ? `Map right padding to ${token.name}` : `No token for ${paddingRight}px right padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                        }
                        // Handle vertical padding
                        if (paddingTop > 0 && paddingTop === paddingBottom && !allPaddingsSameAndPositive && !isVerticalPaddingBound(node)) {
                            const token = findMatchingTokenByValue(paddingTop);
                            issues.push({ node, property: "verticalPadding", currentValue: paddingTop, matchingToken: token, message: token ? `Map vert. padding to ${token.name}` : `No token for ${paddingTop}px vert. padding.` });
                            addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                        }
                        else {
                            // Individual top padding
                            if (paddingTop > 0 && !isIndividualPaddingBound(node, 'paddingTop') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingTop);
                                issues.push({ node, property: "paddingTop", currentValue: paddingTop, matchingToken: token, message: token ? `Map top padding to ${token.name}` : `No token for ${paddingTop}px top padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                            // Individual bottom padding
                            if (paddingBottom > 0 && !isIndividualPaddingBound(node, 'paddingBottom') && !allPaddingsSameAndPositive && !(paddingTop === paddingBottom && !isVerticalPaddingBound(node))) {
                                const token = findMatchingTokenByValue(paddingBottom);
                                issues.push({ node, property: "paddingBottom", currentValue: paddingBottom, matchingToken: token, message: token ? `Map bottom padding to ${token.name}` : `No token for ${paddingBottom}px bottom padding.` });
                                addMarkerToNode(node, token ? "✅ Can Fix Spacing" : "⚠️ No Token Match", token !== null);
                            }
                        }
                    }
                }
            }
            // Recursively check children
            if ("children" in node) {
                for (const child of node.children) {
                    checkNode(child);
                }
            }
        }
        // Smart scoping: prioritize selection, but don't process entire page unnecessarily
        const selection = figma.currentPage.selection;
        const nodesToCheck = selection.length > 0 ? selection : figma.currentPage.children;
        console.log(`Analyzing ${nodesToCheck.length} ${selection.length > 0 ? 'selected' : 'top-level'} nodes for spacing issues...`);
        for (const node of nodesToCheck) {
            checkNode(node);
        }
        console.log(`Found ${issues.length} potential spacing issues.`);
        return issues;
    });
}
// Updated function to add color-coded markers based on whether the issue can be fixed
function addMarkerToNode(node, name, canFix) {
    try {
        // Remove any existing markers for this node first
        const existingMarkers = figma.currentPage.findAll(n => n.type === "ELLIPSE" &&
            n.getPluginData("markerFor") === node.id);
        existingMarkers.forEach(marker => marker.remove());
        // Create new marker
        const indicator = figma.createEllipse();
        // Set appropriate name and color based on whether the issue can be fixed
        if (canFix) {
            indicator.name = "✅ Can Fix Spacing";
            indicator.fills = [{ type: 'SOLID', color: { r: 0.2, g: 0.8, b: 0.2 } }]; // Green
        }
        else {
            indicator.name = "⚠️ No Token Match";
            indicator.fills = [{ type: 'SOLID', color: { r: 1, g: 0.2, b: 0.2 } }]; // Red
        }
        indicator.resize(8, 8);
        const absoluteX = node.absoluteTransform[0][2];
        const absoluteY = node.absoluteTransform[1][2];
        indicator.x = absoluteX - 12;
        indicator.y = absoluteY;
        indicator.setPluginData("markerFor", node.id);
        figma.currentPage.appendChild(indicator);
    }
    catch (e) {
        let message = 'Unknown error';
        if (e instanceof Error)
            message = e.message;
        else if (typeof e === 'string')
            message = e;
        console.error(`Error adding marker to node ${node.name}: ${message}`);
    }
}
// trySetBoundVariable now accepts the full SpacingToken object
function trySetBoundVariable(node, propertyName, token // Changed from variableId to the full token
) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        try {
            // Pass the actual Variable object from the token
            console.log(`Binding ${node.name}.${propertyName} to variable: ${token.name} (ID: ${token.id})`);
            node.setBoundVariable(propertyName, token.variableObject); // Use token.variableObject
            // Verify using node.boundVariables and the token's ID
            const boundVariableAlias = (_a = node.boundVariables) === null || _a === void 0 ? void 0 : _a[propertyName];
            if (boundVariableAlias && boundVariableAlias.id === token.id) { // Compare with token.id
                console.log(`Successfully bound ${propertyName} for ${node.name} to ${token.name}`);
                return true;
            }
            else {
                console.warn(`Verification failed for ${node.name}.${propertyName}. Bound alias:`, boundVariableAlias, `Expected ID: ${token.id}`);
                return false;
            }
        }
        catch (e) {
            let message = 'Unknown error during binding';
            if (e instanceof Error)
                message = e.message;
            else if (typeof e === 'string')
                message = e;
            console.error(`Error binding ${propertyName} for node ${node.name} to variable ${token.name} (ID: ${token.id}): ${message}`);
            // Check if the variable object itself might be an issue (though less likely if it came from getSpacingVariables)
            if (!token.variableObject || typeof token.variableObject.key !== 'string') {
                console.error("The provided token.variableObject seems invalid:", token.variableObject);
            }
            return false;
        }
    });
}
function fixSpacingIssues() {
    return __awaiter(this, void 0, void 0, function* () {
        clearMarkers();
        const issues = yield findSpacingIssues();
        let fixedCount = 0;
        let unfixableCount = 0;
        console.log(`Attempting to fix ${issues.length} spacing issues.`);
        // Count issues that don't have matching tokens
        issues.forEach(issue => {
            if (!issue.matchingToken) {
                unfixableCount++;
            }
        });
        for (const issue of issues) {
            // Ensure matchingToken and its variableObject are valid before proceeding
            if (issue.matchingToken && issue.matchingToken.variableObject) {
                const { node, property, matchingToken } = issue;
                let success = false;
                if (property === "paddingAll") {
                    const propsToBind = ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'];
                    let allSuccess = true;
                    for (const p of propsToBind) {
                        // Pass the full matchingToken
                        if (!(yield trySetBoundVariable(node, p, matchingToken)))
                            allSuccess = false;
                    }
                    success = allSuccess;
                }
                else if (property === "horizontalPadding") {
                    // Pass the full matchingToken
                    const S1 = yield trySetBoundVariable(node, 'paddingLeft', matchingToken);
                    const S2 = yield trySetBoundVariable(node, 'paddingRight', matchingToken);
                    success = S1 && S2;
                }
                else if (property === "verticalPadding") {
                    // Pass the full matchingToken
                    const S1 = yield trySetBoundVariable(node, 'paddingTop', matchingToken);
                    const S2 = yield trySetBoundVariable(node, 'paddingBottom', matchingToken);
                    success = S1 && S2;
                }
                else if (property === "itemSpacing" || property === "paddingLeft" || property === "paddingRight" || property === "paddingTop" || property === "paddingBottom") {
                    // Pass the full matchingToken
                    success = yield trySetBoundVariable(node, property, matchingToken);
                }
                if (success) {
                    fixedCount++;
                }
            }
        }
        console.log(`Successfully applied ${fixedCount} spacing variable bindings.`);
        console.log(`Unable to fix ${unfixableCount} issues due to missing matching tokens.`);
        if (fixedCount > 0) {
            figma.notify(`Applied ${fixedCount} spacing variable bindings. ${unfixableCount > 0 ? `${unfixableCount} values have no matching tokens (marked in red).` : ''}`);
        }
        else if (unfixableCount > 0) {
            figma.notify(`Found ${unfixableCount} spacing values without matching tokens (marked in red).`);
        }
        else if (issues.length === 0) {
            figma.notify(`No unlinked spacing values found.`);
        }
        // Instead of running findSpacingIssues again, let's return our counts
        return { fixed: fixedCount, unfixable: unfixableCount };
    });
}
function revertSpacingBindingsToStatic() {
    return __awaiter(this, void 0, void 0, function* () {
        let revertedCount = 0;
        // Helper function to remove binding and set static value
        function removeBindingAndSetStatic(node, property) {
            try {
                // Check if the property has a binding
                if (!node.boundVariables || !node.boundVariables[property]) {
                    return false;
                }
                // Get the current computed value before removing the binding
                const currentValue = node[property];
                // Remove the binding
                node.setBoundVariable(property, null);
                // Set the static value to match what it was
                node[property] = currentValue;
                return true;
            }
            catch (e) {
                console.error(`Error removing binding for ${property} on node "${node.name}":`, e);
                return false;
            }
        }
        // Function to process a node and revert its spacing bindings
        function processNode(node) {
            let nodeRevertCount = 0;
            if (isAutoLayoutNode(node)) {
                // List of all potential spacing properties we might have bound
                const spacingProperties = [
                    'itemSpacing',
                    'paddingTop',
                    'paddingBottom',
                    'paddingLeft',
                    'paddingRight'
                ];
                // Check each property and revert if bound
                for (const property of spacingProperties) {
                    if (removeBindingAndSetStatic(node, property)) {
                        nodeRevertCount++;
                        console.log(`Reverted ${property} on node "${node.name}" to static value ${node[property]}px`);
                    }
                }
            }
            // Process children recursively
            if ("children" in node) {
                for (const child of node.children) {
                    nodeRevertCount += processNode(child);
                }
            }
            return nodeRevertCount;
        }
        // Get nodes to process (selection or all page nodes)
        const nodesToProcess = figma.currentPage.selection.length > 0
            ? figma.currentPage.selection
            : figma.currentPage.children;
        // Process all nodes
        for (const node of nodesToProcess) {
            revertedCount += processNode(node);
        }
        console.log(`Reverted ${revertedCount} spacing token bindings to static values.`);
        return revertedCount;
    });
}
// Update to the message handler in the main code
// Add this to your message handler - replace the existing figma.ui.onmessage
figma.ui.onmessage = (msg) => __awaiter(this, void 0, void 0, function* () {
    console.log("Received message from UI:", msg.type);
    try {
        if (msg.type === 'find-spacing-issues') {
            clearMarkers();
            const issues = yield findSpacingIssues();
            const uniqueNodeIds = new Set(issues.map(issue => issue.node.id));
            // Count issues that can be fixed vs. those that can't
            const fixableIssues = issues.filter(issue => issue.matchingToken !== null);
            const unfixableIssues = issues.filter(issue => issue.matchingToken === null);
            figma.ui.postMessage({
                type: 'spacing-issues-found',
                count: issues.length,
                fixableCount: fixableIssues.length,
                unfixableCount: unfixableIssues.length,
                nodeCount: uniqueNodeIds.size,
            });
            if (issues.length > 0) {
                const fixableMessage = fixableIssues.length > 0 ?
                    `${fixableIssues.length} can be auto-fixed (green markers)` : '';
                const unfixableMessage = unfixableIssues.length > 0 ?
                    `${unfixableIssues.length} have no matching tokens (red markers)` : '';
                figma.notify(`Found ${issues.length} spacing issues. ${fixableMessage}${fixableMessage && unfixableMessage ? '. ' : ''}${unfixableMessage}`);
            }
            else {
                figma.notify(`No unlinked spacing values found.`);
            }
        }
        else if (msg.type === 'fix-spacing-issues') {
            const result = yield fixSpacingIssues();
            figma.ui.postMessage({
                type: 'spacing-issues-fixed',
                fixedCount: result.fixed,
                unfixableCount: result.unfixable
            });
        }
        else if (msg.type === 'clear-markers') {
            const clearedCount = clearMarkers();
            figma.ui.postMessage({
                type: 'markers-cleared',
                count: clearedCount
            });
            if (clearedCount > 0)
                figma.notify(`Cleared ${clearedCount} markers.`);
        }
        else if (msg.type === 'revert-spacing-bindings') {
            const revertedCount = yield revertSpacingBindingsToStatic();
            figma.ui.postMessage({
                type: 'spacing-bindings-reverted',
                count: revertedCount
            });
            if (revertedCount > 0) {
                figma.notify(`Converted ${revertedCount} token bindings back to static values.`);
            }
            else {
                figma.notify(`No spacing token bindings found to revert.`);
            }
        }
        else if (msg.type === 'refresh-variables') {
            // Add this new message type to force refresh variables cache
            console.log("Force refreshing variables cache...");
            yield getSpacingVariables(true); // Force refresh
            figma.notify("Variables cache refreshed");
            figma.ui.postMessage({
                type: 'variables-refreshed'
            });
        }
    }
    catch (error) {
        let message = 'Unknown error';
        if (error instanceof Error) {
            message = error.message;
        }
        else if (typeof error === 'string') {
            message = error;
        }
        console.error("Error handling UI message:", message, error);
        figma.notify(`Plugin error: ${message}. Check console.`, { error: true });
        figma.ui.postMessage({ type: 'error', message: message });
    }
});
function clearMarkers() {
    try {
        const markers = figma.currentPage.children.filter(node => node.type === "ELLIPSE" &&
            (node.name === "⚠️ No Token Match" ||
                node.name === "✅ Can Fix Spacing" ||
                node.name === "⚠️ Spacing Issue" ||
                node.name === "🎨 Color Issue") &&
            node.getPluginData("markerFor") !== "");
        let clearedCount = 0;
        markers.forEach(markerNode => {
            if (markerNode.type === "ELLIPSE") {
                markerNode.remove();
                clearedCount++;
            }
        });
        console.log(`Cleared ${clearedCount} markers.`);
        return clearedCount;
    }
    catch (error) {
        let message = 'Unknown error';
        if (error instanceof Error)
            message = error.message;
        else if (typeof error === 'string')
            message = error;
        console.error(`Error clearing markers: ${message}`);
        return 0;
    }
}
