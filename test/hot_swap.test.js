var expect = require('expect');
var sinon = require('sinon');

describe('the truth', function() {
	it('is self-consistent', function() {
		expect(HotSwap).toExist();

		expect(true).toBe(true);
		expect(false).toBe(false);
	});
});