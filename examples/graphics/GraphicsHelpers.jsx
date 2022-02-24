import _cloneDeep from 'lodash.clonedeep';
import HopperGraphics from './HopperGraphics.json';
import ShipLoaderGraphics from './ShipLoaderGraphics.json';
import StackerReclaimerGraphics from './StackerReclaimerGraphics.json';
import Stacker2Graphics from './Stacker2Graphics.json';
import SABB_36T_1991 from './SABB_36T_1991.json';
import PACECO_VICKERS_1969 from './PACECO_VICKERS_1969.json';
import PACECO_GE_1973 from './PACECO_GE_1973.json';
import PACECO_ACB_1 from './PACECO_ACB_1.json';
import PACECO_ACB_2 from './PACECO_ACB_2.json';
import Conveyor50Graphics from './Conveyor50Graphics.json';
import Conveyor80Graphics from './Conveyor80Graphics.json';
import Conveyor100Graphics from './Conveyor100Graphics.json';
import Conveyor130Graphics from './Conveyor130Graphics.json';
import Conveyor150Graphics from './Conveyor150Graphics.json';
import Conveyor170Graphics from './Conveyor170Graphics.json';
import { FeatureTypes } from '../../../../types/feature';

const getCraneJsonFeatureGraphics = (featureAttributes) => {
  switch (featureAttributes.model) {
    case 'SABB_36T_1991':
      return SABB_36T_1991;
    case 'PACECO_VICKERS_1969':
      return PACECO_VICKERS_1969;
    case 'PACECO_GE_1973':
      return PACECO_GE_1973;
    case 'PACECO_ACB_1':
      return PACECO_ACB_1;
    case 'PACECO_ACB_2':
      return PACECO_ACB_2;
    default:
      // eslint-disable-next-line no-console
      console.error(`Renderer not implemented for crane model: ${featureAttributes.model}`);
  }

  return [];
};

const getConveyorJsonFeatureGraphics = (featureAttributes) => {
  switch (featureAttributes.model) {
    case '50':
      return Conveyor50Graphics;
    case '80':
      return Conveyor80Graphics;
    case '100':
      return Conveyor100Graphics;
    case '130':
      return Conveyor130Graphics;
    case '150':
      return Conveyor150Graphics;
    case '170':
      return Conveyor170Graphics;
    default:
      // eslint-disable-next-line no-console
      console.error(`Renderer not implemented for conveyor model: ${featureAttributes.model}`);
  }

  return [];
};

export const getJsonFeatureGraphics = (feature) => {
  let graphics = [];
  switch (feature.type) {
    case FeatureTypes.Hopper:
      graphics = HopperGraphics;
      break;
    case FeatureTypes.ShipLoader:
      graphics = ShipLoaderGraphics;
      break;
    case FeatureTypes.StackerReclaimer:
      graphics = StackerReclaimerGraphics;
      break;
    case FeatureTypes.Stacker2:
      graphics = Stacker2Graphics;
      break;
    case FeatureTypes.Crane:
      graphics = getCraneJsonFeatureGraphics(feature.attributes);
      break;
    case FeatureTypes.Conveyor:
      graphics = getConveyorJsonFeatureGraphics(feature.attributes);
      break;
    default:
      // eslint-disable-next-line no-console
      console.error(`Renderer not implemented for type: ${feature.type}`);
  }

  return _cloneDeep(graphics);
};

export const isResizableTextSymbol = ({ symbol, attributes }) =>
  symbol.type === 'text' && attributes.preserveTextRatio;

export const isControlPoint = ({ attributes = {} }) => attributes.isControlPoint || false;

export const isControlPolygon = ({ attributes = {} }) => attributes.isControlPolygon || false;

export const isHandlePoint = ({ attributes = {} }) => attributes.isHandlePoint || false;

export const isRotationPoint = ({ attributes = {} }) => attributes.isRotationPoint || false;

export const isRotationSegmentPoint = ({ attributes = {} }) =>
  attributes.isRotationSegmentPoint || false;

export const isBase = ({ attributes = {} }) => attributes.isBase || false;

export const isRotatingPartGraphic = ({ attributes = {} }) => attributes.isRotatingPart || false;

export const isRotatingPartExtensionGraphic = ({ attributes = {} }) =>
  attributes.isRotatingPartExtension || false;
