"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = TestComponent;
function TestComponent() {
    return (<div>
      {/* P1: Color Contrast — will flag low-contrast text */}
      <p style={{ color: 'gray', backgroundColor: 'white' }}>Low contrast</p>
      <p style={{ color: '#333', backgroundColor: '#fff' }}>Good contrast</p>

      {/* P1: ARIA Pattern — tablist without tabs */}
      <div role="tablist">
        <div>Not a tab</div>
      </div>

      {/* P1: ARIA Pattern — dialog without label */}
      <div role="dialog">
        <p>Dialog content</p>
      </div>

      {/* P1: ARIA Pattern — correct tablist */}
      <div role="tablist">
        <div role="tab" aria-controls="p1" aria-selected={true}>Tab 1</div>
      </div>

      {/* Existing rules still work */}
      <img src="photo.jpg"/>
      <button />
      <div onClick={() => alert('hi')}>Click me</div>
      <input type="text"/>
    </div>);
}
//# sourceMappingURL=TestComponent.js.map