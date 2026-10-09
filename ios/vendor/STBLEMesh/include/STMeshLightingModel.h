/**
 ******************************************************************************
 * @file    STMeshLightingModel.h
 * @author  ST BLE Mesh Team
 * @version V1.03.000
 * @date    15-May-2018
 * @brief   Implementation of Lighting model
 ******************************************************************************
 * @attention
 *
 * <h2><center>&copy; COPYRIGHT(c) 2019 STMicroelectronics</center></h2>
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *   1. Redistributions of source code must retain the above copyright notice,
 *      this list of conditions and the following disclaimer.
 *   2. Redistributions in binary form must reproduce the above copyright notice,
 *      this list of conditions and the following disclaimer in the documentation
 *      and/or other materials provided with the distribution.
 *   3. Neither the name of STMicroelectronics nor the names of its contributors
 *      may be used to endorse or promote products derived from this software
 *      without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
 * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
 * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
 * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
 * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 ******************************************************************************
 */

#import <Foundation/Foundation.h>
#import "STMeshBasicTypes.h"

@protocol STMeshLightingModelDelegate;

@interface STMeshLightingModel : NSObject
@property(nonatomic , weak) id <STMeshLightingModelDelegate> delegate;

/**
 * @brief readLightingLightnessStatus method. peerAddress only one parameter required
 * @discussion This function is used to read Lighting lightness status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightingLightnessStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightingLightnessStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingLightness method. peerAddress, lightness and responseFlag are parameter required
 * @discussion This function is used to send Lighting lightness command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness lightness value
 * @param3 responseFlag response flag
 * @code
    manager.getLightingModel().setLightingLightness(element.unicastAddress, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingLightness:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightingLightnessStatus method. peerAddress, time, delay, responseFlag are the parameter required
 * @discussion This function is used to send Lighting lightness with optional command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness lightness value
 * @param3 time transation time
 * @param4 delay delay
 * @param5 responseFlag response flag
 * @code
    manager.getLightingModel().setLightingLightness(element.unicastAddress,transationTime:23, withDelay:12 , isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingLightness:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness transationTime:(uint8_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightingLightnessLinearStatus method. peerAddress is the parameter required
 * @discussion This function is used to read Lighting lightness Linear status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightingLightnessLinearStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)readLightingLightnessLinearStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingLightnesslinear method. peerAddress, lightness, responseFlag are the parameter required.
 * @discussion This function is used to send Lighting lightness Linear command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness lightness value
 * @param5 responseFlag response flag
 * @code
    manager.getLightingModel().setLightingLightnesslinear(element.unicastAddress, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingLightnesslinear:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief setLightingLightnesslinear method. peerAddress,lightness, time, delay, responseFlag are the parameter required.
 * @discussion This function is used to send Lighting lightness Linear command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness lightness value
 * @param3 time transation time
 * @param4 delay delay
 * @param5 responseFlag response flag
 * @code
    manager.getLightingModel().setLightingLightnesslinear(element.unicastAddress,transationTime:23, withDelay:12  isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingLightnessLinear:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness transationTime:(uint8_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightingLightnessLastStatus method. peerAddress is the parameter required.
 * @discussion This function used to read Lighting lightness Last status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightingLightnessLastStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightingLightnessLastStatus:(uint16_t)peerAddress;

/**
 * @brief readLightingDefaultStatus method. peerAddress is the parameter required.
 * @discussion This function used to read Lighting lightness default status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightingDefaultStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution..
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightingDefaultStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingLightnessDefault method. peerAddress, lightness, responseFlag are the parameters required.
 * @discussion This function used to read Lighting lightness default status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightingDefaultStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)setLightingLightnessDefault:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness isUnacknowledged:(BOOL)responseFlag;


/**
 * @brief readLightingRangeStatus method. peerAddress is the parameter required.
 * @discussion This function is used to read Lighting lightness range status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightingRangeStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightingRangeStatus:(uint16_t)peerAddress;


/**
 * @brief setLightingLightnessRange method. peerAddress, rangeMin, rangeMax, responseFlag are the parameters required.
 * @discussion This function is used to  send lightness range command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 rangeMin   rang min value
 * @param3 rangeMax  rang max value
 * @param4 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingLightnessRange(element.unicastAddress,rangeMinValue:23, rangeMaxValue:12  isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,rangeMinValue is uint16_t datatype,rangeMaxValue is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingLightnessRange:(uint16_t)peerAddress rangeMinValue:(uint16_t)rangeMin rangeMaxValue:(uint16_t)rangeMax isUnacknowledged:(BOOL)responseFlag;


/**
 * @brief readLightCTLStatus method. peerAddress, is the parameter required.
 * @discussion This function is used to read Lighting CTL status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightCTLStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightCTLStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingCTL method. peerAddress, lightness, temperature, deltaUV, responseFlag five parameter required
 * @discussion This function is used to send Lighting CTL command from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness  lightness value
 * @param3 temperature  temperature value
 * @param4 deltaUV ie Delta UV value
 * @param5 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingCTL(element.unicastAddress,lightness:23, temperature:12 ,deltaUVValue:56,  isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,lightness is uint16_t datatype, temperature is uint16_t datatype, deltaUV is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingCTL:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness temperatureValue:(uint16_t)temperature deltaUVValue:(int16_t)deltaUV isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief setLightingCTL method. peerAddress, lightness, temperature, deltaUV,time, delay, responseFlag seven parameter required
 * @discussion This function is used to send Lighting CTL command from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness  lightness value
 * @param3 temperature  temperature value
 * @param4 deltaUV ie Delta UV value
 * @param5 time  transation time
 * @param6 delay  delay
 * @param7 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingCTL(element.unicastAddress,lightness:23, temperature:12 ,deltaUVValue:56,transatimnTime:43, withDelay:12, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,lightness is uint16_t datatype, temperature is uint16_t datatype, deltaUV is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingCTL:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness temperatureValue:(uint16_t)temperature deltaUVValue:(int16_t)deltaUV  transatimnTime:(uint16_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightCTLTemperatureStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting CTL Temperature status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightCTLTemperatureStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightCTLTemperatureStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingCTLTemperature method. peerAddress, temperature, deltaUV, responseFlag are the parameter required
 * @discussion This function is used to send Lighting CTL command from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 temperature  temperature value
 * @param3 deltaUV  Delta UV value
 * @param4 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingCTLTemperature(element.unicastAddress, temperature:12 ,deltaUVValue:56, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, temperature is uint16_t dataType, deltaUV is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingCTLTemperature:(uint16_t)peerAddress temperatureValue:(uint16_t)temperature deltaUVValue:(int16_t)deltaUV isUnacknowledged:(BOOL)responseFlag;


/**
 * @brief setLightingCTLTemperature method. peerAddress, temperature, deltaUV,time, delay, responseFlag six parameter required
 * @discussion This function is used to send Lighting CTL command with optional params from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 temperature  temperature value
 * @param3 deltaUV ie Delta UV value
 * @param4 time  transation time
 * @param5 delay  delay
 * @param6 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingCTLTemperature(element.unicastAddress, temperature:12 ,deltaUVValue:56,transatimnTime:43, withDelay:12, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, temperature is uint16_t datatype, deltaUV is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingCTLTemperature:(uint16_t)peerAddress temperatureValue:(uint16_t)temperature deltaUVValue:(int16_t)deltaUV  transatimnTime:(uint16_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightCTLDefaultStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting CTL default status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightCTLDefaultStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightCTLDefaultStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingCTLDefault method. peerAddress, temperature, deltaUV,time, delay, responseFlag are the parameter required
 * @discussion This function is used to send Lighting CTL command with optional params from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 temperature  temperature value
 * @param3 deltaUV ie Delta UV value
 * @param6 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingCTLTemperature(element.unicastAddress, temperature:12 ,deltaUVValue:56,transatimnTime:43, withDelay:12, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, temperature is uint16_t datatype, deltaUV is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingCTLDefault:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness temperatureValue:(uint16_t)temperature deltaUVValue:(uint16_t)deltaUV isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightCTLTemperatureRangeStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting CTL range status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightCTLTemperatureRangeStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightCTLTemperatureRangeStatus:(uint16_t)peerAddress;


/**
 * @brief setLightCTLTemperatureRange method. peerAddress, rangeMin, rangeMax, responseFlag four parameter required
 * @discussion This function is used to send lightness range command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 rangeMin   rang min value
 * @param3 rangeMax  rang max value
 * @param4 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightCTLTemperatureRange(element.unicastAddress,rangeMinValue:23, rangeMaxValue:12  isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,rangeMinValue is uint16_t datatype,rangeMaxValue is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightCTLTemperatureRange:(uint16_t)peerAddress rangeMinValue:(uint16_t)rangeMin rangeMaxValue:(uint16_t)rangeMax isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightHSLStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting HSL status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightHSLStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightHSLStatus:(uint16_t)peerAddress;


/**
 * @brief setLightingHSL method. peerAddress, lightness, hue, saturation,time, delay, responseFlag seven parameter required
 * @discussion This function is used to send lightness HSL command with optional params from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness  lightness value
 * @param3 hue  Hue value
 * @param4 saturation ie Saturation value
 * @param5 time  transation time
 * @param6 delay  delay
 * @param7 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSL(element.unicastAddress,lightness:23, hueValue:12 ,saturationValue:56,transatimnTime:43, withDelay:12, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,lightness is uint16_t datatype, hue is uint16_t datatype, saturation is uint16_t datatype,time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingHSL:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness hueValue:(uint16_t)hue saturationValue:(uint16_t)saturation transitionTime:(uint16_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief setLightingHSL method. peerAddress, lightness, hue, saturation, responseFlag five parameter required
 * @discussion This function is used to send  Lighting HSL command from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness  lightness value
 * @param3 hue  Hue value
 * @param4 saturation ie Saturation value
 * @param5 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSL(element.unicastAddress,lightness:23, hueValue:12 ,saturationValue:56, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,lightness is uint16_t datatype, hue is uint16_t datatype, saturation is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingHSL:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness hueValue:(uint16_t)hue saturationValue:(uint16_t)saturation isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightHSLHueStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting HSL hue status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightHSLHueStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightHSLHueStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingHSLHue method. peerAddress,  hue, responseFlag, three parameter required
 * @discussion This function is used to  send Lighting HSL hue command from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 hue  Hue value
 * @param3 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSLHue(element.unicastAddress,hueValue:45, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, hue is uint16_t datatype
 */
-(STMeshStatus)setLightingHSLHue:(uint16_t)peerAddress hueValue:(uint16_t)hue isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief setLightingHSLHue method. peerAddress, lightness, hue, saturation,time, delay, responseFlag seven parameter required
 * @discussion This function is used to  send Lighting HSL Hue command with optional params from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 hue  Hue value
 * @param3 time  transation time
 * @param4 delay  delay
 * @param5 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSLHue(element.unicastAddress, hueValue:12 ,transatimnTime:43, withDelay:12, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, hue is uint16_t datatype, time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingHSLHue:(uint16_t)peerAddress hueValue:(uint16_t)hue transitionTime:(uint16_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightHSLSaturationStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting HSL Saturation status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightHSLSaturationStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightHSLSaturationStatus:(uint16_t)peerAddress;


/**
 * @brief setLightingHSLSaturation method. peerAddress,  saturation, responseFlag, three parameter required
 * @discussion This function is used to send Lighting HSL saturation command to a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 saturation  Saturation value
 * @param3 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSLSaturation(element.unicastAddress,saturationValue:45, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, saturation is uint16_t datatype
 */
-(STMeshStatus)setLightingHSLSaturation:(uint16_t)peerAddress saturationValue:(uint16_t)saturation isUnacknowledged:(BOOL)responseFlag;


/**
 * @brief setLightingHSL method. peerAddress, saturation,time, delay, responseFlag five parameter required
 * @discussion This function is used to  send Lighting HSL Saturation command with optional params from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 saturation  Saturation value
 * @param3 time  transation time
 * @param4 delay  delay
 * @param5 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSLHue(element.unicastAddress, saturationValue:12 ,transatimnTime:43, withDelay:12, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype, saturation is uint16_t datatype, time is uint_8t datatype, delay is uint_8t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingHSLSaturation:(uint16_t)peerAddress saturationValue:(uint16_t)saturation transitionTime:(uint16_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/**
 * @brief readLightHSLTargetStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting HSL target status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightHSLTargetStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightHSLTargetStatus:(uint16_t)peerAddress;

/**
 * @brief readLightHSLDefaultStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting HSL Default status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightHSLDefaultStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightHSLDefaultStatus:(uint16_t)peerAddress;

/**
 * @brief setLightingHSLDefault method. peerAddress, lightness, hue, saturation, responseFlag five parameter required
 * @discussion This function is used to send  Lighting HSL Default command from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 lightness  lightness value
 * @param3 hue  Hue value
 * @param4 saturation ie Saturation value
 * @param5 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSLDefault(element.unicastAddress,lightness:23, hueValue:12 ,saturationValue:56, isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,lightness is uint16_t datatype, hue is uint16_t datatype, saturation is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingHSLDefault:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness hueValue:(uint16_t)hue saturationValue:(uint16_t)saturation isUnacknowledged:(BOOL)responseFlag;


/**
 * @brief readLightHSLRangeStatus method. peerAddress one parameter required
 * @discussion This function is used to read Lighting HSL Range status from a element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @code
    manager.getLightingModel().readLightHSLRangeStatus(element.unicastAddress)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype
 */
-(STMeshStatus)readLightHSLRangeStatus:(uint16_t)peerAddress;


/**
 * @brief setLightingHSLRange method. peerAddress, hueMin, hueMax, saturationMin, saturationMax, responseFlag five parameter required
 * @discussion This function is used to send lightness range command to element of a peer node.
 * @param1 peerAddress Peer Address of element
 * @param2 hueMin   Hue min value
 * @param3 hueMax  Hue max value
 * @param2 saturationMin   Saturation min value
 * @param3 saturationMax  Saturation max value
 * @param4 responseFlag  response flag
 * @code
    manager.getLightingModel().setLightingHSLRange(element.unicastAddress,hueMinValue:23, hueMaxValue:12, saturationMinValue:23, saturationMaxValue:34,  isUnacknowledged:true)
 * @endcode
 * @return  Result of the method execution.
 * @remarks Parameters peerAddress is uint16_t datatype,hueMinValue is uint16_t datatype,hueMaxValue is uint16_t datatype, saturationMin is uint16_t datatype, saturationMax is uint16_t datatype, responseFlag is Bool datatype
 */
-(STMeshStatus)setLightingHSLRange:(uint16_t)peerAddress hueMinValue:(uint16_t)hueMin hueMaxValue:(uint16_t)hueMax saturationMinValue:(uint16_t)saturationMin saturationMaxValue:(uint16_t)saturationMax  isUnacknowledged:(BOOL)responseFlag;




/* Light Control Model*/
// Light Mode messages
/*!
 * @brief getLightLCMode Get Light Control Mode
 * @discussion This function is used to get the light mode
 * @param  peerAddress Peer Address of element
 * @return  Result of the method execution.
 * @remarks peerAddress is uint16_t
 */

-(STMeshStatus)getLightLCMode:(uint16_t)peerAddress;
/*!
 * @brief setLightLCMode. peerAddress and bit value is required
 * @discussion This function is used to set the light mode
 * @param1  peerAddress Peer Address of element
 * @param2 bitValue Binary value of mode
 * @param3 isUnacknowledged By default reliable command, set it true for unreliable commands.
 * @return  Result of the method execution.
 * @remarks peerAddress is uint16_t, bitValue is a binary value but will take it as uint8_t i.e is either 0 or 1 can be passed.
 */

-(STMeshStatus)setLightLCMode:(uint16_t)peerAddress mode:(uint8_t)bitValue isUnacknowledged:(bool)isUnacknowledged ;


//Light OccupancyMode messages
/*!
 * @brief getLightOccupancyMode. only peerAddress is required
 * @discussion This function is used to get the light occupancy mode.
 * @param  peerAddress Peer Address of element
 * @return  Result of the method execution.
 * @remarks peerAddress is uint16_t.
 */
-(STMeshStatus)getLightLCOccupancyMode:(uint16_t)peerAddress;
/*!
 * @brief setLightOccupancyMode. peerAddress and bitValue is required
 * @discussion This function is used to set the light occupancy mode.
 * @param1 peerAddress Peer Address of element
 * @param2 bitValue Binary value of mode
 * @param3 isUnacknowledged By default reliable command, set it true for unreliable commands.
 * @return  Result of the method execution.
 * @remarks peerAddress is uint16_t, bitValue is a binary value but will take it as uint8_t i.e is either 0 or 1 can be passed.
 */
-(STMeshStatus)setLightLCOccupancyMode:(uint16_t)peerAddress mode:(uint8_t)bitValue isUnacknowledged:(bool)isUnacknowledged ;



//Light Property messages

/*!
 * @brief getLightLCPropertyMode.  peerAddress and propertyID is required.
 * @discussion This function is used to get the Property of light mode
 * @param1  peerAddress Peer Address of element
 * @param2 propertyID PropertyID of the Light
 * @return  Result of the method execution.
 * @remarks peerAddress and propertyID are uint16_t type
 */
-(STMeshStatus)getLightLCPropertyMode:(uint16_t)peerAddress propertyID:(uint16_t)propertyID;
/*!
 * @brief setLightLCPropertyMode.  peerAddress, propertyID and propertyValue is required.
 * @discussion This function is used to set the Property of light mode .
 * @param1  peerAddress Peer Address of element
 * @param2 propertyID PropertyID of the light
 * @param3 propertyValue Property Value of the light
 * @param4 len length of the property value i.e uint16 , uint24 etc
 * @param5 isUnacknowledged By default reliable command, set it true for unreliable commands.
 * @return  Result of the method execution.
 * @remarks peerAddress,propertyID and propertyValue are uint16_t type
 */
-(STMeshStatus)setLightLCPropertyMode:(uint16_t)peerAddress propertyID:(uint16_t)propertyID  propertyValue:(uint32_t)propertyValue propertyValueLength : (uint8_t) len isUnacknowledged:(bool)isUnacknowledged;

// Light On/off
/*!
 * @brief getLightLCOnOff. peerAddress is required.
 * @discussion This function is used to Get On/Off status of the light.
 * @param  peerAddress Peer Address of element
 * @return  Result of the method execution.
 * @remarks peerAddress is uint16_t type
 */
-(STMeshStatus) getLightLCOnOff:(uint16_t) peerAddress;


/*!
 * @brief setLightLCOnOff. peerAddress is required.
 * @discussion This function is used to Get On/Off status of the light.
 * @param1 peerAddress Peer Address of element
 * @param2 lightOnOffState On/Off State of the light
 * @param3 tid TransactionIdentifier: Indicates whether the message is a new message or a retransmission of a previously sent message
 * @param4 transitionStepResolution The resolution of the Default Transition Number of Steps field.
 * @param5 transitionStepsNumber The number of Steps.
 * @param6 delay This field shall be present when the Transition Time field (calculated as  Transition Step Resolution *  Transition Number of Steps) is present. It identifies the message execution delay, representing a time interval between receiving the message by a model and executing the associated model behaviors
 * @param7 isUnacknowledged By default reliable command, set it true for unreliable commands.
 * @return  Result of the method execution.
 * @remarks peerAddress is uint16_t type and lightOnOffStatus,tid, transitionStepResolution, transitionStepResolution ,TransitionStepsNumber and delay is uint8_t type.
 */
-(STMeshStatus) setLightLCOnOff:(uint16_t) peerAddress  lightOnOffStatus:(uint8_t) lightOnOffState tid:(uint8_t) tid  transitionStepResolution: (uint8_t) transitionStepResolution transitionStepsNumber:( uint8_t) transitionStepsNumber delay:( uint8_t)delay isUnacknowledged:(bool)isUnacknowledged ;




/* Light XYL */

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)readLightXYLStatus:(uint16_t)peerAddress;
/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)setLightingXYL:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness xyL_xValue:(uint16_t)xyL_x  xyL_yValue:(uint16_t)xyL_y isUnacknowledged:(BOOL)responseFlag;

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)setLightingXYL:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness xyL_xValue:(uint16_t)xyL_x  xyL_yValue:(uint16_t)xyL_y transitionTime:(uint16_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)readLightXYLTargetStatus:(uint16_t)peerAddress;

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)readLightXYLDefaultStatus:(uint16_t)peerAddress;

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)setLightingXYLDefault:(uint16_t)peerAddress lightnessValue:(uint16_t)lightness xyL_xValue:(uint16_t)xyL_x  xyL_yValue:(uint16_t)xyL_y isUnacknowledged:(BOOL)responseFlag;

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)readLightXYLRangeStatus:(uint16_t)peerAddress;

/* This method is used to read Lighting lightness status from a element of a peer node. */
-(STMeshStatus)setLightingXYLRange:(uint16_t)peerAddress xyL_xRangeMinValue:(uint16_t)xyL_xRangeMin xyL_xRangeMaxValue:(uint16_t)xyL_xRangeMax  xyL_yRangeMinValue:(uint16_t)xyL_yRangeMin xyL_yRangeMaxValue:(uint16_t)xyL_yRangeMax isUnacknowledged:(BOOL)responseFlag;




//-(STMeshStatus)setLightControlOnOff:(uint16_t)peerAddress isOn:(bool)isOn isUnacknowledged:(BOOL)responseFlag;
//-(STMeshStatus)setLightControlOnOff:(uint16_t)peerAddress isOn:(bool)isOn transitionTime:(uint8_t)time withDelay:(uint8_t)delay isUnacknowledged:(BOOL)responseFlag;


















@end

@protocol STMeshLightingModelDelegate <NSObject>

@optional
/**
 * @brief  This is a callback Lighting Lightness status of lighting models with lightingModel, peerAddress, presentLightness, targetLightness, time,stateFlag Six Param required.
 * @discussion This callback is invoked when Lighting Lightness value read or  Lighting Lightness value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentLightness Present Lightness Value.
 * @param4  targetLightness Target Lightness value
 * @param5  time  remaining time value
 * @param6  stateFlag  target value flag
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLightnessStatusFromAddress:(uint16_t)peerAddress
      presentLightness:(uint16_t)presentLightness targetLightness:(uint16_t)targetLightness remainingTime:(uint8_t)time isTargetStatePresent:(BOOL)stateFlag;

/**
 * @brief  This is a callback Lighting Lightness linear status  of lighting models with lightingModel, peerAddress, presentLightness, targetLightness, time,stateFlag Six Param required.
 * @discussion This callback is invoked when Lighting Lightness linear value read or Lighting Lightness linear value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentLightness Present Lightness Value.
 * @param4  targetLightness Target Lightness value
 * @param5  time  remaining time value
 * @param6  stateFlag  Target value flag
 */

- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLightnessLinearStatusFromAddress:(uint16_t)peerAddress
       presentLighness:(uint16_t)presentLightness targetLightness:(uint16_t)targetLightness remainingTime:(uint8_t)time isTargetStatePresent:(BOOL)stateFlag;


/**
 * @brief  This is a callback Lighting Lightness Last status  of lighting models with lightingModel, peerAddress, lightness, three Param required.
 * @discussion This callback is invoked when Lighting Lightness Last value read
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  lightness  Lightness Value.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLightnessLastStatusFromAddress:(uint16_t)peerAddress
        lightnessValue:(uint16_t)lightness ;

/**
 * @brief  This is a callback Lighting Lightness default status  of lighting models with lightingModel, peerAddress, lightness, three Param required.
 * @discussion This callback is invoked when Lighting Lightness Default value read or Lighting Lightness Default value set with response flag
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  lightness  Lightness Value.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLightnessDefaultStatusFromAddress:(uint16_t)peerAddress
        lightnessValue:(uint16_t)lightness;


/**
 * @brief  This is a callback Lighting Lightness Range status  of lighting models with lightingModel, peerAddress, statusCode, rangeMin,rangeMax five Param required.
 * @discussion This callback is invoked when Lighting Lightness range value read or Lighting Lightness Range value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  statusCode StatusCode Value.
 * @param4  rangeMin  Range Min value
 * @param5  rangeMax  Range Max value
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLightnessRangeStatusFromAddress:(uint16_t)peerAddress
                status:(uint8_t)statusCode rangeMinValue:(uint16_t)rangeMin rangeMaxValue:(uint16_t)rangeMax;


/**
 * @brief  This is a callback Lighting CTL status of lighting models with lightingModel, peerAddress,presentLightness, presentTemperature,targetLightness,targetTemperature, stateFlag Seven Param required.
 * @discussion This callback is invoked when Lighting CTL value read or Lighting CTL value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentLightness Present Lightness Value.
 * @param4  presentTemperature  Present Temperature value
 * @param5  targetLightness  Target Lightness value
 * @Param6  targetTemperature Target Temperature Value
 * @Param7 stateFlag target value flag
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveCTLStatusFromAddress:(uint16_t)peerAddress
      presentLightness:(uint16_t)presentLightness presentTemperature:(uint16_t)presentTemperature targetLightness:(uint16_t)targetLightness  targeTemperature:(uint16_t)targetTemperature  isTargetStatePresent:(BOOL)stateFlag;

/**
 * @brief  This is a callback Lighting CTL Temperature status of lighting models with lightingModel, peerAddress, presentTemperature,presentDeltaUV,targetTemperature, targetDeltaVU, stateFlag Seven Param required.
 * @discussion This callback is invoked when Lighting CTL Temperature value read or Lighting CTL Temperature value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentTemperature  Present Temperature value
 * @param4  presentDeltaUV Present DeltaUV Value.
 * @Param5  targetTemperature Target Temperature Value
 * @param6  targetDeltaVU  Target DeltaVU value
 * @Param7 stateFlag target value flag
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveCTLTemperatureStatusFromAddress:(uint16_t)peerAddress
    presentTemperature:(uint16_t)presentTemperature presentDeltaVU:(uint16_t)presentDeltaUV targeTemperature:(uint16_t)targetTemperature targetDeltaVU:(uint16_t)targetDeltaVU isTargetStatePresent:(BOOL)stateFlag;


/**
 * @brief  This is a callback Lighting CTL Temperature range status of lighting models with lightingModel, peerAddress, statusCode, rangeMin, rangeMax Five Param required.
 
 * @discussion This callback is invoked when Lighting CTL Temperature Range value read or Lighting CTL Temperature Range value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  statusCode  Status Code Value
 * @param4  rangeMin Range Min Value.
 * @Param5  rangeMax Range Max Value
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveCTLTemperatureRangeStatusFromAddress:(uint16_t)peerAddress
                status:(uint8_t)statusCode rangeMinValue:(uint16_t)rangeMin rangeMaxValue:(uint16_t)rangeMax;

/**
 * @brief  This is a callback Lighting CTL Default status of lighting models with lightingModel, peerAddress, statusCode, rangeMin, rangeMax Five Param required.
 
 * @discussion This callback is invoked when Lighting CTL Default value read or Lighting CTL Default value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentLightness  present Lightness Value.
 * @param4  presentTemperature Present Temperature.
 */

- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveCTLDefaultStatusFromAddress:(uint16_t)peerAddress
      presentLightness:(uint16_t)presentLightness presentTemperature:(uint16_t)presentTemperature;
/**
 * @brief  This is a callback Lighting HSL status of lighting models with lightingModel, peerAddress, lightness, hue, saturation, remainingTime, stateFlag Seven Param required.
 
 * @discussion This callback is invoked when Lighting HSL value read or Lighting HSL value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  lightness  Lightness Value.
 * @param4  hue Hue Value.
 * @param5  saturation saturation value.
 * @param6  remainingTime  Remaining Time.
 * @param7  stateFlag  target flag Value.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveHSLStatusFromAddress:(uint16_t)peerAddress
        lightnessValue:(uint16_t)lightness hueValue:(uint16_t)hue saturationValue:(uint16_t)saturation remainingTime:(uint8_t)remainingTime isTargetStatePresent:(BOOL)stateFlag;

/**
 * @brief  This is a callback Lighting HSL Hue status of lighting models with lightingModel, peerAddress, presentHue, targetHue, remainingTime, stateFlag Six Param required.
 
 * @discussion This callback is invoked when Lighting HSL Hue value read or Lighting HSL Hue value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentHue  Present Hue Value.
 * @param4  targetHue  Target Hue Value.
 * @param5  time  Remaining Time.
 * @param6  stateFlag  target flag Value.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveHSLHueStatusFromAddress:(uint16_t)peerAddress
            presentHue:(uint16_t)presentHue targetHue:(uint16_t)targetHue remainingTime:(uint16_t)time  isTargetStatePresent:(BOOL)stateFlag;


/**
 * @brief  This is a callback Lighting HSL Saturation status of lighting models with lightingModel, peerAddress, presentHue, targetHue, remainingTime, stateFlag Six Param required.
 
 * @discussion This callback is invoked when Lighting HSL Saturation value read or Lighting HSL Saturation value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  presentSaturation  Present Saturation Value.
 * @param4  targetSaturation  Target Saturation Value.
 * @param5  time  Remaining Time.
 * @param6  stateFlag  target flag Value.
 */

- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveHSLSaturationStatusFromAddress:(uint16_t)peerAddress
     presentSaturation:(uint16_t)presentSaturation targetSaturation:(uint16_t)targetSaturation remainingTime:(uint16_t)time  isTargetStatePresent:(BOOL)stateFlag;

/**
 * @brief  This is a callback Lighting HSL Target status of lighting models with lightingModel, lightness, hue, saturationTarget, remainingTime, stateFlag Six Param required.
 * @discussion This callback is invoked when Lighting HSL Target value read or Lighting HSL Target value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  lightness   Lightness Value.
 * @param4  hue  Hue Value.
 * @param5  remainingTime  Remaining Time.
 * @param6  stateFlag  target flag Value.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveHSLTargetStatusFromAddress:(uint16_t)peerAddress
       targetLightness:(uint16_t)lightness targetHue:(uint16_t)hue targetSaturation:(uint16_t)saturationTarget remainingTime:(uint8_t)remainingTime isTargetStatePresent:(BOOL)stateFlag;

/**
 * @brief  This is a callback Lighting HSL Default status of lighting models with lightingModel, lightness, hue, saturationValue, Four Param required.
 * @discussion This callback is invoked when Lighting HSL Default value read
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  lightness   Lightness Value.
 * @param4  hue  Hue Value.
 */

- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveHSLDefaultStatusFromAddress:(uint16_t)peerAddress
        lightnessValue:(uint16_t)lightness hueValue:(uint16_t)hue saturationValue:(uint16_t)saturationValue;

/**
 * @brief  This is a callback Lighting HSL Range status of lighting models with lightingModel, lightness, hueMin, hueMax,saturationMin, saturationMax  Six Param required.
 
 * @discussion This callback is invoked when Lighting HSL Range value read or Lighting HSL Range value set with response flag.
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  hueMin  Hue Min  Value.
 * @param4  hueMax  Hue  maxValue.
 * @param5  saturationMin  Saturation Min  Value.
 * @param6  saturationMax  Saturation max  Value.
 */

- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveHSLRangeStatusFromAddress:(uint16_t)peerAddress
                status:(uint8_t)statusCode hueMinValue:(uint16_t)hueMin hueMaxValue:(uint16_t)hueMax saturationMinValue:(uint16_t)saturationMin saturationMaxValue:(uint16_t)saturationMax;


/* LC Model Delegates */

/**
 * @brief  This is a callback Light Mode status of Light Control Model: lCModeModel, mode.
 
 * @discussion This callback is invoked when Light Model Get / Set will be called with reponseFlag .
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  mode : Light Mode.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didRecieveLCLightModeStatus:(uint16_t)peerAddress mode:(uint8_t)mode;
/**
 * @brief  This is a callback Light Occupancy Mode status of Light Control Model: lCModeModel, occupancyMode are the parameters.
 
 * @discussion This callback is invoked when Light Model Get / Set will be called with reponseFlag .
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  occupancyMode : Light Occupancy Mode.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didRecieveLCLightOccupancyModeStatus:(uint16_t)peerAddress occupancyMode:(uint8_t)occupancyMode;

/**
 * @brief  This is a callback Light ON/OFF status of Light Control Model: lCModeModel, presentLightOnOFF, targetLightOnOff and remainingTime are the parameters.
 
 * @discussion This callback is invoked when Light Model GetON/OFF and Set ON/OFF will be called with reponseFlag .
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  PresentLightOnOffStatus : Current Light On/Off Status.
 * @param4  targetLightOnOff : Current Light On/Off Status.
 * @param5  remainingTime : Time remaining to transit to a state.
 */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLCLightPresentOnOffStatus:(uint16_t)peerAddress presentLightOnOFF:(uint8_t)PresentLightOnOffStatus targetLightOnOff: (uint8_t) targetLightOnOff remainingTime :(uint8_t) remainingTime;
/**
 * @brief  This is a callback Light Property status of Light Control Model: lCModeModel, peerAddress, propertyID and propertyValue are the parameters.
 
 * @discussion This callback is invoked when Light Model Get Property and Set Property will be called with reponseFlag .
 * @param1  lightingModel  object of lighting model.
 * @param2  peerAddress  Unicast address of the current proxy node.
 * @param3  propertyID : Propety Value of light.
 * @param4  propertyValue : Propety Value of light.
 */

- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveLCLightPropertyStatus:(uint16_t)peerAddress propertyID:(uint16_t)propertyID propertyValue: (uint32_t) propertyValue ;



/* This callback is called when lighting XYL status is received from the element of peer node. */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveXYLStatusFromAddress:(uint16_t)peerAddress
        lightnessValue:(uint16_t)lightness XYL_xValue:(uint16_t)XYL_x XYL_yValue:(uint16_t)XYL_y remainingTime:(uint8_t)remainingTime isTargetStatePresent:(BOOL)stateFlag;

/* This callback is called when lighting XYL target status is received from the element of peer node. */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveXYLTargetStatusFromAddress:(uint16_t)peerAddress
       targetLightness:(uint16_t)lightness targetXYL_x:(uint16_t)XYL_x  targetXYL_y:(uint16_t)XYL_y  remainingTime:(uint8_t)time;

/* This callback is called when lighting XYL target status is received from the element of peer node. */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveXYLTargetStatusFromAddress:(uint16_t)peerAddress
       targetLightness:(uint16_t)lightness targetXYL_x:(uint16_t)XYL_x  targetXYL_y:(uint16_t)XYL_y  remainingTime:(uint8_t)time isRemainingPresent:(BOOL)remaingTimeflag;

/* This callback is called when lighting XYL default status is received from the element of peer node. */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveXYLDefaultStatusFromAddress:(uint16_t)peerAddress
        lightnessValue:(uint16_t)lightness XYL_xValue:(uint16_t)XYL_x  XYL_Value:(uint16_t)XYL_y;

/* This callback is called when lighting XYL range status is received from the element of peer node. */
- (void) lightingModel:(STMeshLightingModel*)lightingModel didReceiveXYLRangeStatusFromAddress:(uint16_t)peerAddress
                status:(uint8_t)statusCode XYL_xRangeMinValue:(uint16_t)XYL_xRangeMin XYL_xRangeMaxValue:(uint16_t)XYL_xRangeMax XYL_yRangeMinValue:(uint16_t)XYL_yRangeMin XYL_yRangeMaxValue:(uint16_t)XYL_yRangeMax;
@end

